DROP INDEX team_rewards_media;
ALTER TABLE team_rewards DROP COLUMN media_id;
DROP INDEX team_reward_media_team_created;
DROP TABLE team_reward_media;
