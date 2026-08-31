DROP INDEX IF EXISTS team_rewards_media;
ALTER TABLE team_rewards DROP COLUMN media_id;
DROP INDEX IF EXISTS team_reward_media_team_created;
DROP TABLE IF EXISTS team_reward_media;
