# Spontime API Documentation

## Overview

The Spontime API enables users to discover and participate in spontaneous, nearby activities and events. The system supports real-time location-based discovery, interest-based filtering, and lightweight chat for event participants.

## Features

- **Geospatial Discovery**: Find active plans within a customizable radius using PostGIS
- **Interest-Based Filtering**: Filter plans by tags (sports, food, music, etc.)
- **Distance Ordering**: Plans sorted by proximity and start time
- **Member-Only Chat**: Secure messaging limited to plan participants
- **Rate Limiting**: Anti-spam protection (5 messages per minute per user)
- **Access Control**: Only plan members can view and post messages

## Database Schema

### Core Tables

#### `spontime_users`
User profiles for the Spontime platform.

```sql
CREATE TABLE spontime_users (
  id UUID PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT,
  bio TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

#### `plans`
Events/activities with geospatial support.

```sql
CREATE TABLE plans (
  id UUID PRIMARY KEY,
  creator_id UUID REFERENCES spontime_users(id),
  title TEXT NOT NULL,
  description TEXT,
  location_lat DECIMAL(10, 8) NOT NULL,
  location_lon DECIMAL(11, 8) NOT NULL,
  location_point GEOGRAPHY(POINT, 4326),  -- PostGIS geography
  location_name TEXT,
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP,
  max_participants INTEGER,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

#### `interest_tags`
Predefined categories for filtering plans.

```sql
CREATE TABLE interest_tags (
  id UUID PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMP
);
```

Default tags include: Sports, Food & Drinks, Music, Art & Culture, Outdoor, Gaming, Networking, Learning, Fitness, Nightlife

#### `plan_tags`
Junction table linking plans to tags (many-to-many).

```sql
CREATE TABLE plan_tags (
  plan_id UUID REFERENCES plans(id),
  tag_id UUID REFERENCES interest_tags(id),
  PRIMARY KEY (plan_id, tag_id)
);
```

#### `plan_members`
Tracks which users have joined which plans.

```sql
CREATE TABLE plan_members (
  id UUID PRIMARY KEY,
  plan_id UUID REFERENCES plans(id),
  user_id UUID REFERENCES spontime_users(id),
  joined_at TIMESTAMP,
  status TEXT DEFAULT 'active',
  UNIQUE(plan_id, user_id)
);
```

#### `messages`
Chat messages for plan participants.

```sql
CREATE TABLE messages (
  id UUID PRIMARY KEY,
  plan_id UUID REFERENCES plans(id),
  user_id UUID REFERENCES spontime_users(id),
  content TEXT NOT NULL,
  created_at TIMESTAMP
);
```

## API Endpoints

### GET `/api/plans/now`

Discover active plans near a specific location.

#### Query Parameters

| Parameter | Type   | Required | Default | Description                                    |
|-----------|--------|----------|---------|------------------------------------------------|
| `lat`     | float  | Yes      | -       | Latitude (-90 to 90)                          |
| `lon`     | float  | Yes      | -       | Longitude (-180 to 180)                       |
| `radius`  | float  | No       | 2000    | Search radius in meters                       |
| `tags`    | string | No       | -       | Comma-separated tag names (OR logic)          |

#### Time Window

- **Start**: 30 minutes ago (includes plans that recently started)
- **End**: 2 hours from now

#### Example Requests

```bash
# Basic search (2km radius, next 2 hours)
GET /api/plans/now?lat=37.7749&lon=-122.4194

# Custom radius (5km)
GET /api/plans/now?lat=37.7749&lon=-122.4194&radius=5000

# Filter by tags (OR logic - Sports OR Food & Drinks)
GET /api/plans/now?lat=37.7749&lon=-122.4194&tags=Sports,Food%20%26%20Drinks

# Combination
GET /api/plans/now?lat=37.7749&lon=-122.4194&radius=3000&tags=Music,Outdoor
```

#### Response Format

```json
{
  "plans": [
    {
      "id": "uuid",
      "title": "Pickup Basketball Game",
      "description": "Casual 3v3 basketball at the park",
      "creator_id": "uuid",
      "location_lat": 37.7749,
      "location_lon": -122.4194,
      "location_name": "Golden Gate Park",
      "start_time": "2025-01-05T18:30:00Z",
      "end_time": "2025-01-05T20:00:00Z",
      "max_participants": 6,
      "status": "active",
      "distance_meters": 450,
      "tags": ["Sports", "Fitness"],
      "member_count": 4,
      "created_at": "2025-01-05T16:00:00Z"
    }
  ],
  "count": 1,
  "filters": {
    "latitude": 37.7749,
    "longitude": -122.4194,
    "radius_meters": 2000,
    "tags": ["Sports"],
    "time_window": {
      "start": "2025-01-05T17:30:00Z",
      "end": "2025-01-05T19:30:00Z"
    }
  }
}
```

#### Sorting

Plans are ordered by:
1. **Distance** (ascending) - closest plans first
2. **Start time proximity** (ascending) - plans starting soonest

#### Error Responses

- `400 Bad Request`: Missing or invalid parameters
- `500 Internal Server Error`: Database or server error

---

### GET `/api/plans/[id]/messages`

Retrieve chat messages for a specific plan (members only).

#### Query Parameters

| Parameter | Type   | Required | Default | Description                                    |
|-----------|--------|----------|---------|------------------------------------------------|
| `user_id` | string | Yes      | -       | User ID (would come from auth in production) |
| `limit`   | int    | No       | 50      | Maximum messages to return (1-100)            |
| `before`  | string | No       | -       | Cursor (timestamp) for pagination             |

#### Example Requests

```bash
# Get latest messages
GET /api/plans/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/messages?user_id=uuid

# Pagination - get older messages
GET /api/plans/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/messages?user_id=uuid&before=2025-01-05T17:30:00Z

# Custom limit
GET /api/plans/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/messages?user_id=uuid&limit=20
```

#### Response Format

```json
{
  "messages": [
    {
      "id": "uuid",
      "plan_id": "uuid",
      "user_id": "uuid",
      "username": "alice_sports",
      "display_name": "Alice Johnson",
      "avatar_url": "https://i.pravatar.cc/150?img=1",
      "content": "Looking forward to playing today!",
      "created_at": "2025-01-05T17:00:00Z"
    }
  ],
  "count": 1,
  "has_more": false
}
```

#### Access Control

- Only users who are active members of the plan can view messages
- Returns `403 Forbidden` if user is not a member

#### Error Responses

- `401 Unauthorized`: Missing user_id
- `403 Forbidden`: User is not a plan member
- `500 Internal Server Error`: Database or server error

---

### POST `/api/plans/[id]/messages`

Post a new message to a plan's chat (members only).

#### Request Body

```json
{
  "user_id": "uuid",
  "content": "Hey everyone! Looking forward to this!"
}
```

#### Validation

- `user_id`: Required
- `content`: Required, 1-5000 characters after trimming

#### Rate Limiting

- **Limit**: 5 messages per minute per user per plan
- **Window**: Rolling 60-second window
- Returns `429 Too Many Requests` if limit exceeded

#### Example Request

```bash
POST /api/plans/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/messages
Content-Type: application/json

{
  "user_id": "11111111-1111-1111-1111-111111111111",
  "content": "See you all there!"
}
```

#### Response Format

```json
{
  "id": "uuid",
  "plan_id": "uuid",
  "user_id": "uuid",
  "username": "alice_sports",
  "display_name": "Alice Johnson",
  "avatar_url": "https://i.pravatar.cc/150?img=1",
  "content": "See you all there!",
  "created_at": "2025-01-05T17:30:00Z"
}
```

#### Access Control

- Only users who are active members of the plan can post messages
- Returns `403 Forbidden` if user is not a member

#### Error Responses

- `400 Bad Request`: Invalid or missing content
- `401 Unauthorized`: Missing user_id
- `403 Forbidden`: User is not a plan member
- `429 Too Many Requests`: Rate limit exceeded
- `500 Internal Server Error`: Database or server error

---

## Setup Instructions

### Prerequisites

- PostgreSQL 14+ with PostGIS extension
- Node.js 18+
- Environment variables configured (see `.env.example`)

### Database Migration

1. Apply the migration:

```bash
psql -U your_user -d your_database -f migrations/004_spontime_schema.sql
```

2. Seed test data (optional):

```bash
psql -U your_user -d your_database -f migrations/seed_spontime_data.sql
```

### Running Tests

```bash
npm test -- tests/integration/spontime/api.test.ts
```

## Security & Privacy Notes

### PII Protection

- Chat content is visible only to plan members
- User details exposed in API responses are limited to:
  - Username (pseudonymized handle)
  - Display name
  - Avatar URL
- No email addresses, phone numbers, or other sensitive PII in API responses

### Authentication

In a production environment:
- Replace `user_id` query parameter with session-based authentication
- Use JWT tokens or session cookies
- Implement proper user authentication/authorization middleware

### Rate Limiting

Current implementation:
- 5 messages per minute per user per plan
- Stored in database for simplicity
- For production, consider Redis-based rate limiting for better performance

## Performance Considerations

### Geospatial Queries

- PostGIS `ST_DWithin` uses spatial indexes (GIST) for efficient radius queries
- Index on `location_point` column enables fast lookups
- Typical query time: < 50ms for radius searches with 10,000+ plans

### Message Retrieval

- Composite index on `(plan_id, created_at DESC)` for fast message fetching
- Pagination supported via cursor-based approach
- Limit enforced to prevent excessive data transfer

### Scalability

For high-traffic deployments:
- Consider read replicas for geospatial queries
- Implement caching layer (Redis) for popular plans
- Use WebSocket connections for real-time chat updates
- Partition messages table by time range

## Future Enhancements

- [ ] WebSocket support for real-time messaging
- [ ] Push notifications for new messages
- [ ] Plan search by title/description
- [ ] User blocking/reporting
- [ ] Image/media sharing in chat
- [ ] Plan recommendations based on user interests
- [ ] Calendar integration
