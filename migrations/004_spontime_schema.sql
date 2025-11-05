-- Migration: 004_spontime_schema
-- Description: Create Spontime schema for plans, users, interest tags, and messages
-- Author: System
-- Date: 2025-01-05
-- Requirements: Spontime MVP - Core Interaction

-- Enable PostGIS extension for geospatial queries
CREATE EXTENSION IF NOT EXISTS postgis;

-- Create users table for Spontime
CREATE TABLE IF NOT EXISTS spontime_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT,
  bio TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create interest_tags table
CREATE TABLE IF NOT EXISTS interest_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create plans table with geospatial support
CREATE TABLE IF NOT EXISTS plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES spontime_users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  location_lat DECIMAL(10, 8) NOT NULL,
  location_lon DECIMAL(11, 8) NOT NULL,
  location_point GEOGRAPHY(POINT, 4326),
  location_name TEXT,
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP,
  max_participants INTEGER,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT chk_plan_coordinates CHECK (
    location_lat >= -90 AND location_lat <= 90 AND
    location_lon >= -180 AND location_lon <= 180
  ),
  CONSTRAINT chk_plan_times CHECK (end_time IS NULL OR end_time > start_time),
  CONSTRAINT chk_plan_status CHECK (status IN ('active', 'cancelled', 'completed', 'full'))
);

-- Create plan_tags junction table
CREATE TABLE IF NOT EXISTS plan_tags (
  plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES interest_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (plan_id, tag_id)
);

-- Create plan_members table
CREATE TABLE IF NOT EXISTS plan_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES spontime_users(id) ON DELETE CASCADE,
  joined_at TIMESTAMP DEFAULT NOW(),
  status TEXT DEFAULT 'active',
  UNIQUE(plan_id, user_id),
  CONSTRAINT chk_member_status CHECK (status IN ('active', 'left', 'removed'))
);

-- Create messages table
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES spontime_users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT chk_message_content CHECK (LENGTH(content) > 0 AND LENGTH(content) <= 5000)
);

-- Create rate_limit_log table for anti-spam
CREATE TABLE IF NOT EXISTS message_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES spontime_users(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  message_count INTEGER DEFAULT 1,
  window_start TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, plan_id, window_start)
);

-- Create indexes for performance

-- Users indexes
CREATE INDEX IF NOT EXISTS idx_users_username ON spontime_users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON spontime_users(email);

-- Plans indexes
CREATE INDEX IF NOT EXISTS idx_plans_creator ON plans(creator_id);
CREATE INDEX IF NOT EXISTS idx_plans_start_time ON plans(start_time);
CREATE INDEX IF NOT EXISTS idx_plans_status ON plans(status);
CREATE INDEX IF NOT EXISTS idx_plans_location_point ON plans USING GIST(location_point);

-- Messages indexes
CREATE INDEX IF NOT EXISTS idx_messages_plan_created ON messages(plan_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_user ON messages(user_id);

-- Plan members indexes
CREATE INDEX IF NOT EXISTS idx_plan_members_plan ON plan_members(plan_id);
CREATE INDEX IF NOT EXISTS idx_plan_members_user ON plan_members(user_id);
CREATE INDEX IF NOT EXISTS idx_plan_members_status ON plan_members(status);

-- Rate limit indexes
CREATE INDEX IF NOT EXISTS idx_rate_limits_user_plan ON message_rate_limits(user_id, plan_id, window_start);

-- Trigger to automatically set location_point from lat/lon
CREATE OR REPLACE FUNCTION update_plan_location_point()
RETURNS TRIGGER AS $$
BEGIN
  NEW.location_point = ST_SetSRID(ST_MakePoint(NEW.location_lon, NEW.location_lat), 4326)::geography;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_plan_location_point
BEFORE INSERT OR UPDATE OF location_lat, location_lon ON plans
FOR EACH ROW
EXECUTE FUNCTION update_plan_location_point();

-- Insert some default interest tags
INSERT INTO interest_tags (name, description) VALUES
  ('Sports', 'Physical activities and sports'),
  ('Food & Drinks', 'Dining, coffee, and social eating'),
  ('Music', 'Live music, concerts, and jam sessions'),
  ('Art & Culture', 'Museums, galleries, and cultural events'),
  ('Outdoor', 'Hiking, parks, and outdoor activities'),
  ('Gaming', 'Board games, video games, and gaming events'),
  ('Networking', 'Professional and social networking'),
  ('Learning', 'Workshops, classes, and educational events'),
  ('Fitness', 'Gym, yoga, and fitness activities'),
  ('Nightlife', 'Bars, clubs, and evening entertainment')
ON CONFLICT (name) DO NOTHING;
