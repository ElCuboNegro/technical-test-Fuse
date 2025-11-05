import { NextRequest, NextResponse } from 'next/server';
import { database } from '@/lib/database';

interface PlanResponse {
  id: string;
  title: string;
  description: string;
  creator_id: string;
  location_lat: number;
  location_lon: number;
  location_name: string | null;
  start_time: string;
  end_time: string | null;
  max_participants: number | null;
  status: string;
  distance_meters: number;
  tags: string[];
  member_count: number;
  created_at: string;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // Parse query parameters
    const searchParams = request.nextUrl.searchParams;
    const lat = searchParams.get('lat');
    const lon = searchParams.get('lon');
    const radius = searchParams.get('radius') || '2000'; // Default 2 km in meters
    const tags = searchParams.get('tags'); // Comma-separated tag names
    
    // Validate required parameters
    if (!lat || !lon) {
      return NextResponse.json(
        { error: 'Missing required parameters: lat and lon' },
        { status: 400 }
      );
    }

    const latitude = parseFloat(lat);
    const longitude = parseFloat(lon);
    const radiusMeters = parseFloat(radius);

    // Validate coordinates
    if (isNaN(latitude) || isNaN(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return NextResponse.json(
        { error: 'Invalid coordinates. Latitude must be between -90 and 90, longitude between -180 and 180' },
        { status: 400 }
      );
    }

    if (isNaN(radiusMeters) || radiusMeters <= 0) {
      return NextResponse.json(
        { error: 'Invalid radius. Must be a positive number' },
        { status: 400 }
      );
    }

    // Ensure database is connected
    await database.connect();

    // Calculate time window (default: next 2 hours from now, and plans that started up to 30 min ago)
    const now = new Date();
    const timeWindowStart = new Date(now.getTime() - 30 * 60 * 1000); // 30 minutes ago
    const timeWindowEnd = new Date(now.getTime() + 2 * 60 * 60 * 1000); // 2 hours from now

    // Build query based on whether tags are provided
    let query: string;
    let params: any[];

    if (tags) {
      const tagArray = tags.split(',').map(t => t.trim()).filter(t => t.length > 0);
      
      if (tagArray.length === 0) {
        return NextResponse.json(
          { error: 'Invalid tags parameter' },
          { status: 400 }
        );
      }

      // Query with tag filtering (OR logic)
      query = `
        WITH nearby_plans AS (
          SELECT 
            p.*,
            ST_Distance(
              p.location_point,
              ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
            ) as distance_meters
          FROM plans p
          WHERE p.status = 'active'
            AND p.start_time >= $3
            AND p.start_time <= $4
            AND ST_DWithin(
              p.location_point,
              ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
              $5
            )
        ),
        plan_with_tags AS (
          SELECT 
            np.*,
            COALESCE(
              json_agg(DISTINCT it.name) FILTER (WHERE it.name IS NOT NULL),
              '[]'
            ) as tags
          FROM nearby_plans np
          LEFT JOIN plan_tags pt ON np.id = pt.plan_id
          LEFT JOIN interest_tags it ON pt.tag_id = it.id
          GROUP BY np.id, np.creator_id, np.title, np.description, np.location_lat, 
                   np.location_lon, np.location_point, np.location_name, np.start_time, 
                   np.end_time, np.max_participants, np.status, np.created_at, 
                   np.updated_at, np.distance_meters
          HAVING EXISTS (
            SELECT 1 FROM plan_tags pt2
            JOIN interest_tags it2 ON pt2.tag_id = it2.id
            WHERE pt2.plan_id = np.id AND it2.name = ANY($6)
          )
        )
        SELECT 
          pwt.*,
          COUNT(pm.id) as member_count
        FROM plan_with_tags pwt
        LEFT JOIN plan_members pm ON pwt.id = pm.plan_id AND pm.status = 'active'
        GROUP BY pwt.id, pwt.creator_id, pwt.title, pwt.description, pwt.location_lat,
                 pwt.location_lon, pwt.location_point, pwt.location_name, pwt.start_time,
                 pwt.end_time, pwt.max_participants, pwt.status, pwt.created_at,
                 pwt.updated_at, pwt.distance_meters, pwt.tags
        ORDER BY pwt.distance_meters ASC, ABS(EXTRACT(EPOCH FROM (pwt.start_time - NOW()))) ASC
        LIMIT 50;
      `;
      
      params = [longitude, latitude, timeWindowStart, timeWindowEnd, radiusMeters, tagArray];
    } else {
      // Query without tag filtering
      query = `
        WITH nearby_plans AS (
          SELECT 
            p.*,
            ST_Distance(
              p.location_point,
              ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
            ) as distance_meters
          FROM plans p
          WHERE p.status = 'active'
            AND p.start_time >= $3
            AND p.start_time <= $4
            AND ST_DWithin(
              p.location_point,
              ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
              $5
            )
        ),
        plan_with_tags AS (
          SELECT 
            np.*,
            COALESCE(
              json_agg(DISTINCT it.name) FILTER (WHERE it.name IS NOT NULL),
              '[]'
            ) as tags
          FROM nearby_plans np
          LEFT JOIN plan_tags pt ON np.id = pt.plan_id
          LEFT JOIN interest_tags it ON pt.tag_id = it.id
          GROUP BY np.id, np.creator_id, np.title, np.description, np.location_lat,
                   np.location_lon, np.location_point, np.location_name, np.start_time,
                   np.end_time, np.max_participants, np.status, np.created_at,
                   np.updated_at, np.distance_meters
        )
        SELECT 
          pwt.*,
          COUNT(pm.id) as member_count
        FROM plan_with_tags pwt
        LEFT JOIN plan_members pm ON pwt.id = pm.plan_id AND pm.status = 'active'
        GROUP BY pwt.id, pwt.creator_id, pwt.title, pwt.description, pwt.location_lat,
                 pwt.location_lon, pwt.location_point, pwt.location_name, pwt.start_time,
                 pwt.end_time, pwt.max_participants, pwt.status, pwt.created_at,
                 pwt.updated_at, pwt.distance_meters, pwt.tags
        ORDER BY pwt.distance_meters ASC, ABS(EXTRACT(EPOCH FROM (pwt.start_time - NOW()))) ASC
        LIMIT 50;
      `;
      
      params = [longitude, latitude, timeWindowStart, timeWindowEnd, radiusMeters];
    }

    const result = await database.query(query, params);

    // Format response
    const plans: PlanResponse[] = result.rows.map((row: any) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      creator_id: row.creator_id,
      location_lat: parseFloat(row.location_lat),
      location_lon: parseFloat(row.location_lon),
      location_name: row.location_name,
      start_time: row.start_time,
      end_time: row.end_time,
      max_participants: row.max_participants,
      status: row.status,
      distance_meters: Math.round(row.distance_meters),
      tags: row.tags || [],
      member_count: parseInt(row.member_count) || 0,
      created_at: row.created_at,
    }));

    return NextResponse.json({
      plans,
      count: plans.length,
      filters: {
        latitude,
        longitude,
        radius_meters: radiusMeters,
        tags: tags ? tags.split(',').map(t => t.trim()) : [],
        time_window: {
          start: timeWindowStart.toISOString(),
          end: timeWindowEnd.toISOString(),
        },
      },
    });

  } catch (error) {
    console.error('Error fetching plans:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch plans',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
