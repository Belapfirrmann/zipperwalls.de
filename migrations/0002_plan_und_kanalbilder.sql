ALTER TABLE posts ADD COLUMN plan_nr INTEGER;
ALTER TABLE posts ADD COLUMN channel_images TEXT NOT NULL DEFAULT '{}';
CREATE INDEX idx_posts_plan ON posts(plan_nr);
