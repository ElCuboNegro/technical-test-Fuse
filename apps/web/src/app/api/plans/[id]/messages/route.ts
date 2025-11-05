import { NextRequest, NextResponse } from 'next/server';
import { database } from '@/lib/database';

interface Message {
  id: string;
  plan_id: string;
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  content: string;
  created_at: string;
}

// Rate limiting configuration
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_MESSAGES_PER_WINDOW = 5;

async function checkRateLimit(userId: string, planId: string): Promise<boolean> {
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
  
  // Clean up old rate limit records
  await database.query(
    `DELETE FROM message_rate_limits WHERE window_start < $1`,
    [windowStart]
  );
  
  // Count messages in current window
  const result = await database.query(
    `SELECT COUNT(*) as message_count 
     FROM messages 
     WHERE user_id = $1 AND plan_id = $2 AND created_at >= $3`,
    [userId, planId, windowStart]
  );
  
  const messageCount = parseInt(result.rows[0]?.message_count || '0');
  
  return messageCount < MAX_MESSAGES_PER_WINDOW;
}

async function checkMembership(userId: string, planId: string): Promise<boolean> {
  const result = await database.query(
    `SELECT 1 FROM plan_members 
     WHERE user_id = $1 AND plan_id = $2 AND status = 'active'
     LIMIT 1`,
    [userId, planId]
  );
  
  return result.rows.length > 0;
}

// GET /api/plans/[id]/messages - Fetch messages for a plan
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const planId = params.id;
    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get('user_id'); // In a real app, this would come from session/auth
    const limit = parseInt(searchParams.get('limit') || '50');
    const before = searchParams.get('before'); // Cursor for pagination (timestamp)

    if (!userId) {
      return NextResponse.json(
        { error: 'user_id is required' },
        { status: 401 }
      );
    }

    // Ensure database is connected
    await database.connect();

    // Check if user is a member of the plan
    const isMember = await checkMembership(userId, planId);
    
    if (!isMember) {
      return NextResponse.json(
        { error: 'You must be a member of this plan to view messages' },
        { status: 403 }
      );
    }

    // Build query for fetching messages
    let query: string;
    let params: any[];

    if (before) {
      query = `
        SELECT 
          m.id,
          m.plan_id,
          m.user_id,
          m.content,
          m.created_at,
          u.username,
          u.display_name,
          u.avatar_url
        FROM messages m
        JOIN spontime_users u ON m.user_id = u.id
        WHERE m.plan_id = $1 AND m.created_at < $2
        ORDER BY m.created_at DESC
        LIMIT $3
      `;
      params = [planId, before, limit];
    } else {
      query = `
        SELECT 
          m.id,
          m.plan_id,
          m.user_id,
          m.content,
          m.created_at,
          u.username,
          u.display_name,
          u.avatar_url
        FROM messages m
        JOIN spontime_users u ON m.user_id = u.id
        WHERE m.plan_id = $1
        ORDER BY m.created_at DESC
        LIMIT $2
      `;
      params = [planId, limit];
    }

    const result = await database.query(query, params);

    const messages: Message[] = result.rows.map((row: any) => ({
      id: row.id,
      plan_id: row.plan_id,
      user_id: row.user_id,
      username: row.username,
      display_name: row.display_name,
      avatar_url: row.avatar_url,
      content: row.content,
      created_at: row.created_at,
    }));

    // Reverse to get chronological order
    messages.reverse();

    return NextResponse.json({
      messages,
      count: messages.length,
      has_more: result.rows.length === limit,
    });

  } catch (error) {
    console.error('Error fetching messages:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch messages',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// POST /api/plans/[id]/messages - Create a new message
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const planId = params.id;
    const body = await request.json();
    const { user_id, content } = body;

    // Validate input
    if (!user_id) {
      return NextResponse.json(
        { error: 'user_id is required' },
        { status: 401 }
      );
    }

    if (!content || typeof content !== 'string') {
      return NextResponse.json(
        { error: 'content is required and must be a string' },
        { status: 400 }
      );
    }

    const trimmedContent = content.trim();
    
    if (trimmedContent.length === 0) {
      return NextResponse.json(
        { error: 'Message content cannot be empty' },
        { status: 400 }
      );
    }

    if (trimmedContent.length > 5000) {
      return NextResponse.json(
        { error: 'Message content cannot exceed 5000 characters' },
        { status: 400 }
      );
    }

    // Ensure database is connected
    await database.connect();

    // Check if user is a member of the plan
    const isMember = await checkMembership(user_id, planId);
    
    if (!isMember) {
      return NextResponse.json(
        { error: 'You must be a member of this plan to post messages' },
        { status: 403 }
      );
    }

    // Check rate limit
    const withinRateLimit = await checkRateLimit(user_id, planId);
    
    if (!withinRateLimit) {
      return NextResponse.json(
        { 
          error: 'Rate limit exceeded',
          details: `Maximum ${MAX_MESSAGES_PER_WINDOW} messages per minute allowed`
        },
        { status: 429 }
      );
    }

    // Insert message
    const result = await database.query(
      `INSERT INTO messages (plan_id, user_id, content)
       VALUES ($1, $2, $3)
       RETURNING id, plan_id, user_id, content, created_at`,
      [planId, user_id, trimmedContent]
    );

    const message = result.rows[0];

    // Fetch user details
    const userResult = await database.query(
      `SELECT username, display_name, avatar_url FROM spontime_users WHERE id = $1`,
      [user_id]
    );

    const user = userResult.rows[0];

    const response: Message = {
      id: message.id,
      plan_id: message.plan_id,
      user_id: message.user_id,
      username: user.username,
      display_name: user.display_name,
      avatar_url: user.avatar_url,
      content: message.content,
      created_at: message.created_at,
    };

    return NextResponse.json(response, { status: 201 });

  } catch (error) {
    console.error('Error creating message:', error);
    return NextResponse.json(
      { 
        error: 'Failed to create message',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
