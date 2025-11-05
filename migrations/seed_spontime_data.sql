-- Seed data for Spontime features
-- This file contains test data for users, plans, tags, and messages

-- Insert test users
INSERT INTO spontime_users (id, username, email, display_name, bio, avatar_url) VALUES
  ('11111111-1111-1111-1111-111111111111', 'alice_sports', 'alice@example.com', 'Alice Johnson', 'Sports enthusiast and coffee lover', 'https://i.pravatar.cc/150?img=1'),
  ('22222222-2222-2222-2222-222222222222', 'bob_foodie', 'bob@example.com', 'Bob Smith', 'Always looking for the next great restaurant', 'https://i.pravatar.cc/150?img=2'),
  ('33333333-3333-3333-3333-333333333333', 'carol_music', 'carol@example.com', 'Carol Davis', 'Live music fan and guitar player', 'https://i.pravatar.cc/150?img=3'),
  ('44444444-4444-4444-4444-444444444444', 'david_outdoor', 'david@example.com', 'David Lee', 'Hiking and nature photography', 'https://i.pravatar.cc/150?img=4'),
  ('55555555-5555-5555-5555-555555555555', 'emma_art', 'emma@example.com', 'Emma Wilson', 'Artist and museum enthusiast', 'https://i.pravatar.cc/150?img=5')
ON CONFLICT (id) DO NOTHING;

-- Insert test plans with various locations and times
-- San Francisco area plans
INSERT INTO plans (id, creator_id, title, description, location_lat, location_lon, location_name, start_time, end_time, max_participants, status) VALUES
  -- Plan starting in 30 minutes
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'Pickup Basketball Game', 'Casual 3v3 basketball at the park. All skill levels welcome!', 37.7749, -122.4194, 'Golden Gate Park', NOW() + INTERVAL '30 minutes', NOW() + INTERVAL '2 hours', 6, 'active'),
  
  -- Plan starting in 1 hour
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'Coffee & Chat', 'Let''s grab coffee and talk about life, work, or whatever!', 37.7849, -122.4094, 'Blue Bottle Coffee', NOW() + INTERVAL '1 hour', NOW() + INTERVAL '2 hours', 4, 'active'),
  
  -- Plan starting in 1.5 hours
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '33333333-3333-3333-3333-333333333333', 'Live Jazz Night', 'Checking out a new jazz band at this cool venue', 37.7649, -122.4294, 'The Jazz Club SF', NOW() + INTERVAL '90 minutes', NOW() + INTERVAL '4 hours', 8, 'active'),
  
  -- Plan starting soon (15 minutes)
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', '44444444-4444-4444-4444-444444444444', 'Sunset Hike', 'Quick hike to catch the sunset. Moderate difficulty.', 37.8049, -122.4394, 'Lands End Trail', NOW() + INTERVAL '15 minutes', NOW() + INTERVAL '3 hours', 10, 'active'),
  
  -- Plan in different location (should be filtered by distance)
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '55555555-5555-5555-5555-555555555555', 'Museum Visit', 'Exploring the new modern art exhibition', 37.8716, -122.2585, 'UC Berkeley Art Museum', NOW() + INTERVAL '2 hours', NOW() + INTERVAL '4 hours', 6, 'active')
ON CONFLICT (id) DO NOTHING;

-- Get tag IDs for associating with plans
DO $$
DECLARE
  sports_tag_id UUID;
  food_tag_id UUID;
  music_tag_id UUID;
  outdoor_tag_id UUID;
  art_tag_id UUID;
  fitness_tag_id UUID;
BEGIN
  SELECT id INTO sports_tag_id FROM interest_tags WHERE name = 'Sports';
  SELECT id INTO food_tag_id FROM interest_tags WHERE name = 'Food & Drinks';
  SELECT id INTO music_tag_id FROM interest_tags WHERE name = 'Music';
  SELECT id INTO outdoor_tag_id FROM interest_tags WHERE name = 'Outdoor';
  SELECT id INTO art_tag_id FROM interest_tags WHERE name = 'Art & Culture';
  SELECT id INTO fitness_tag_id FROM interest_tags WHERE name = 'Fitness';

  -- Associate plans with tags
  INSERT INTO plan_tags (plan_id, tag_id) VALUES
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', sports_tag_id),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', fitness_tag_id),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', food_tag_id),
    ('cccccccc-cccc-cccc-cccc-cccccccccccc', music_tag_id),
    ('dddddddd-dddd-dddd-dddd-dddddddddddd', outdoor_tag_id),
    ('dddddddd-dddd-dddd-dddd-dddddddddddd', fitness_tag_id),
    ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', art_tag_id)
  ON CONFLICT DO NOTHING;
END $$;

-- Add plan members
INSERT INTO plan_members (plan_id, user_id, status) VALUES
  -- Basketball game members
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'active'), -- creator
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '44444444-4444-4444-4444-444444444444', 'active'),
  
  -- Coffee chat members
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'active'), -- creator
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '55555555-5555-5555-5555-555555555555', 'active'),
  
  -- Jazz night members
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '33333333-3333-3333-3333-333333333333', 'active'), -- creator
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '11111111-1111-1111-1111-111111111111', 'active'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '22222222-2222-2222-2222-222222222222', 'active'),
  
  -- Sunset hike members
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', '44444444-4444-4444-4444-444444444444', 'active'), -- creator
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', '33333333-3333-3333-3333-333333333333', 'active'),
  
  -- Museum visit members
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '55555555-5555-5555-5555-555555555555', 'active') -- creator
ON CONFLICT DO NOTHING;

-- Add some sample messages
INSERT INTO messages (plan_id, user_id, content) VALUES
  -- Basketball game messages
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'Hey everyone! Looking forward to playing some ball today!'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '44444444-4444-4444-4444-444444444444', 'Count me in! Should I bring an extra ball?'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'That would be great, thanks!'),
  
  -- Coffee chat messages
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'First time trying this coffee place. Anyone been here before?'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '55555555-5555-5555-5555-555555555555', 'Yes! Their cappuccino is amazing 😊'),
  
  -- Jazz night messages
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '33333333-3333-3333-3333-333333333333', 'The band tonight is supposed to be incredible'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '11111111-1111-1111-1111-111111111111', 'Can''t wait! I love live jazz'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '22222222-2222-2222-2222-222222222222', 'Should we grab dinner before?'),
  
  -- Sunset hike messages
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', '44444444-4444-4444-4444-444444444444', 'Weather looks perfect for a sunset hike!'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', '33333333-3333-3333-3333-333333333333', 'Bringing my camera 📸')
ON CONFLICT DO NOTHING;
