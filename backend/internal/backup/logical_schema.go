package backup

// Owned here rather than derived from the live schema: an older export must
// import into a newer schema, so absent fields fall back to a default here.

type fieldKind int

const (
	fieldText fieldKind = iota
	fieldInteger
	fieldReal
	fieldBlob
)

// A field with no default that an export omits is an error; there is no safe
// value to invent.
type logicalField struct {
	Name       string
	Kind       fieldKind
	Nullable   bool
	HasDefault bool
	Default    any
}

// Declaration order is foreign-key dependency order, so one pass never
// references a row that has not been written yet.
type logicalTable struct {
	Name   string
	Fields []logicalField
	// Always the primary key, so two exports of the same data are byte-identical.
	OrderBy []string
	// Rows a migration inserts, cleared on import so the export stays authoritative.
	Seeded bool
}

func textField(name string) logicalField    { return logicalField{Name: name, Kind: fieldText} }
func integerField(name string) logicalField { return logicalField{Name: name, Kind: fieldInteger} }
func realField(name string) logicalField    { return logicalField{Name: name, Kind: fieldReal} }
func blobField(name string) logicalField    { return logicalField{Name: name, Kind: fieldBlob} }

func nullable(field logicalField) logicalField {
	field.Nullable = true
	field.HasDefault = true
	field.Default = nil
	return field
}

func withDefault(field logicalField, value any) logicalField {
	field.HasDefault = true
	field.Default = value
	return field
}

// Do not reorder: this is also the import order and referential integrity relies on it.
var logicalTables = []logicalTable{
	{
		Name:    "clubs",
		OrderBy: []string{"id"},
		Fields: []logicalField{
			textField("id"),
			textField("name"),
			textField("created_at"),
		},
	},
	{
		Name:    "teams",
		OrderBy: []string{"id"},
		Fields: []logicalField{
			textField("id"),
			textField("club_id"),
			textField("name"),
			textField("season_id"),
			integerField("weekly_default_goal"),
			textField("time_zone"),
			textField("created_at"),
		},
	},
	{
		Name:    "players",
		OrderBy: []string{"id"},
		Fields: []logicalField{
			textField("id"),
			textField("club_id"),
			textField("first_name"),
			textField("last_initial"),
			textField("avatar_configuration_json"),
			textField("created_at"),
		},
	},
	{
		Name:    "team_lounge_rooms",
		OrderBy: []string{"room_id"},
		Fields: []logicalField{
			textField("room_id"),
			textField("team_id"),
			textField("week_key"),
			textField("canvas_id"),
			integerField("canvas_version"),
			textField("created_at"),
		},
	},
	{
		Name:    "team_lounge_snapshots",
		OrderBy: []string{"room_id"},
		Fields: []logicalField{
			textField("room_id"),
			textField("canvas_id"),
			integerField("canvas_version"),
			integerField("scene_revision"),
			integerField("checkpoint_revision"),
			integerField("host_epoch"),
			integerField("tick"),
			integerField("normalized"),
			textField("captured_at"),
			textField("snapshot_json"),
			withDefault(textField("mutation_receipts_json"), "[]"),
			withDefault(textField("mutation_high_water_json"), "[]"),
			withDefault(integerField("room_ownership_generation"), int64(0)),
			withDefault(integerField("mutation_outcome_revision"), int64(0)),
			withDefault(textField("mutation_outcomes_json"), "[]"),
		},
	},
	{
		Name:    "team_lounge_visits",
		OrderBy: []string{"room_id", "player_id"},
		Fields: []logicalField{
			textField("room_id"),
			textField("player_id"),
			textField("last_visited_at"),
		},
	},
	{
		Name:    "team_lounge_placement_credits",
		OrderBy: []string{"team_id", "player_id", "week_key", "day_key"},
		Fields: []logicalField{
			textField("team_id"),
			textField("player_id"),
			textField("week_key"),
			textField("day_key"),
			textField("source_kind"),
			textField("source_id"),
			textField("granted_at"),
		},
	},
	{
		Name:    "team_lounge_placement_reservations",
		OrderBy: []string{"reservation_id"},
		Fields: []logicalField{
			textField("reservation_id"),
			textField("team_id"),
			textField("player_id"),
			textField("week_key"),
			textField("day_key"),
			textField("room_id"),
			textField("canvas_id"),
			integerField("canvas_version"),
			textField("definition_id"),
			integerField("definition_version"),
			realField("position_x"),
			realField("position_y"),
			realField("rotation"),
			realField("scale"),
			textField("config_json"),
			blobField("idempotency_key_hash"),
			blobField("request_hash"),
			blobField("permit_hash"),
			textField("permit_expires_at"),
			nullable(textField("mutation_key")),
			textField("state"),
			nullable(textField("entity_id")),
			nullable(textField("rejection_code")),
			textField("held_at"),
			nullable(textField("finalized_at")),
		},
	},
	{
		Name:    "team_lounge_item_mutation_permits",
		OrderBy: []string{"permit_id"},
		Fields: []logicalField{
			textField("permit_id"),
			textField("reservation_id"),
			textField("team_id"),
			textField("player_id"),
			textField("room_id"),
			textField("canvas_id"),
			integerField("canvas_version"),
			textField("entity_id"),
			textField("definition_id"),
			integerField("definition_version"),
			integerField("item_revision"),
			textField("mutation_kind"),
			nullable(realField("position_x")),
			nullable(realField("position_y")),
			nullable(realField("rotation")),
			nullable(realField("scale")),
			blobField("idempotency_key_hash"),
			blobField("request_hash"),
			blobField("permit_hash"),
			textField("permit_expires_at"),
			nullable(textField("mutation_key")),
			textField("state"),
			nullable(textField("rejection_code")),
			textField("issued_at"),
			nullable(textField("finalized_at")),
		},
	},
	{
		Name:    "accounts",
		OrderBy: []string{"id"},
		Fields: []logicalField{
			textField("id"),
			// Null for a platform_admin, which belongs to no single club.
			nullable(textField("club_id")),
			nullable(textField("player_id")),
			textField("role"),
			textField("status"),
			textField("created_at"),
		},
	},
	{
		Name:    "team_memberships",
		OrderBy: []string{"team_id", "player_id", "active_from"},
		Fields: []logicalField{
			textField("team_id"),
			textField("player_id"),
			textField("active_from"),
			nullable(textField("active_to")),
		},
	},
	{
		Name:    "coach_team_assignments",
		OrderBy: []string{"team_id", "account_id", "active_from"},
		Fields: []logicalField{
			textField("team_id"),
			textField("account_id"),
			textField("active_from"),
			nullable(textField("active_to")),
		},
	},
	{
		Name:    "activity_definitions",
		OrderBy: []string{"id"},
		Seeded:  true,
		Fields: []logicalField{
			textField("id"),
			textField("name"),
			textField("input_kind"),
			textField("unit"),
			realField("minimum_value"),
			realField("maximum_value"),
			realField("step_value"),
			withDefault(realField("default_value"), float64(1)),
			integerField("approved_for_player_entry"),
		},
	},
	{
		Name:    "assignment_catalog",
		OrderBy: []string{"key"},
		Seeded:  true,
		Fields: []logicalField{
			textField("key"),
			textField("display_name"),
			textField("activity_definition_id"),
			realField("default_target_value"),
			textField("default_target_unit"),
			integerField("approved"),
		},
	},
	{
		Name:    "assignments",
		OrderBy: []string{"id"},
		Fields: []logicalField{
			textField("id"),
			textField("team_id"),
			textField("activity_definition_id"),
			textField("catalog_key"),
			realField("target_value"),
			textField("target_unit"),
			textField("starts_on"),
			textField("due_on"),
			textField("created_at"),
		},
	},
	{
		Name:    "training_plans",
		OrderBy: []string{"id"},
		Fields: []logicalField{
			textField("id"),
			textField("team_id"),
			textField("template_id"),
			integerField("template_version"),
			textField("template_name"),
			textField("template_summary"),
			textField("starts_on"),
			textField("ends_on"),
			textField("status"),
			nullable(textField("replaces_plan_id")),
			textField("created_at"),
			nullable(textField("cancelled_at")),
		},
	},
	{
		Name:    "training_plan_days",
		OrderBy: []string{"plan_id", "day_index"},
		Fields: []logicalField{
			textField("plan_id"),
			integerField("day_index"),
			textField("occurs_on"),
			textField("kind"),
			textField("focus"),
			integerField("duration_minutes"),
			textField("intensity"),
		},
	},
	{
		Name:    "training_plan_blocks",
		OrderBy: []string{"plan_id", "day_index", "block_index"},
		Fields: []logicalField{
			textField("plan_id"),
			integerField("day_index"),
			integerField("block_index"),
			textField("activity_definition_id"),
			textField("label"),
			integerField("duration_minutes"),
		},
	},
	{
		Name:    "training_entries",
		OrderBy: []string{"id"},
		Fields: []logicalField{
			textField("id"),
			textField("player_id"),
			textField("team_id"),
			textField("activity_definition_id"),
			nullable(textField("assignment_id")),
			textField("occurred_at"),
			realField("result_value"),
			textField("result_unit"),
			integerField("effort_level"),
			integerField("exhaustion_level"),
			textField("created_at"),
			textField("delete_eligible_until"),
			nullable(textField("deleted_at")),
			nullable(textField("idempotency_key")),
			nullable(textField("training_plan_id")),
			nullable(integerField("training_plan_day_index")),
			nullable(integerField("training_plan_block_index")),
			nullable(textField("completion_outcome")),
		},
	},
	{
		Name:    "planned_rest_check_ins",
		OrderBy: []string{"id"},
		Fields: []logicalField{
			textField("id"),
			textField("player_id"),
			textField("team_id"),
			textField("training_plan_id"),
			integerField("training_plan_day_index"),
			textField("occurs_on"),
			textField("idempotency_key"),
			textField("created_at"),
		},
	},
	{
		Name:    "prize_boxes",
		OrderBy: []string{"id"},
		Fields: []logicalField{
			textField("id"),
			textField("player_id"),
			textField("source"),
			nullable(textField("daily_day")),
			nullable(textField("daily_time_zone")),
			nullable(textField("training_plan_id")),
			integerField("catalog_version"),
			textField("earned_at"),
			nullable(blobField("earned_idempotency_key_hash")),
			nullable(textField("opened_at")),
			nullable(blobField("open_idempotency_key_hash")),
			nullable(textField("item_kind")),
			nullable(textField("item_id")),
		},
	},
	{
		Name:    "player_unlocks",
		OrderBy: []string{"player_id", "item_kind", "item_id"},
		Fields: []logicalField{
			textField("player_id"),
			textField("item_kind"),
			textField("item_id"),
			textField("source"),
			textField("unlocked_at"),
			nullable(textField("viewed_at")),
		},
	},
	{
		Name:    "team_reward_media",
		OrderBy: []string{"id"},
		Fields: []logicalField{
			textField("id"),
			textField("team_id"),
			textField("storage_key"),
			textField("sha256"),
			textField("mime_type"),
			integerField("width"),
			integerField("height"),
			integerField("byte_size"),
			textField("alt_kind"),
			textField("created_by_account_id"),
			textField("created_at"),
			nullable(textField("deleted_at")),
		},
	},
	{
		Name:    "team_rewards",
		OrderBy: []string{"id"},
		Fields: []logicalField{
			textField("id"),
			textField("team_id"),
			textField("created_by_account_id"),
			textField("definition_id"),
			integerField("definition_version"),
			textField("prize_title"),
			textField("prize_description"),
			textField("artwork_id"),
			textField("status"),
			textField("starts_on"),
			textField("ends_on"),
			textField("time_zone"),
			integerField("rule_version"),
			integerField("required_days"),
			integerField("minimum_roster_percent"),
			blobField("publish_idempotency_key_hash"),
			nullable(textField("achieved_at")),
			nullable(textField("cancelled_at")),
			textField("created_at"),
			textField("updated_at"),
			nullable(textField("media_id")),
		},
	},
	{
		Name:    "team_reward_events",
		OrderBy: []string{"id"},
		Fields: []logicalField{
			textField("id"),
			textField("reward_id"),
			nullable(textField("actor_account_id")),
			textField("event_type"),
			textField("occurred_at"),
		},
	},
	{
		Name:    "reactions",
		OrderBy: []string{"id"},
		Fields: []logicalField{
			textField("id"),
			textField("sender_player_id"),
			textField("recipient_player_id"),
			textField("team_id"),
			textField("reaction_type"),
			textField("context_type"),
			nullable(textField("context_period")),
			nullable(textField("context_metric")),
			nullable(textField("context_assignment_id")),
			textField("team_day"),
			textField("idempotency_key"),
			textField("created_at"),
			nullable(textField("read_at")),
			nullable(textField("deleted_at")),
			withDefault(integerField("remaining_after_send"), int64(0)),
		},
	},
	{
		Name:    "auth_credentials",
		OrderBy: []string{"id"},
		Fields: []logicalField{
			textField("id"),
			textField("account_id"),
			blobField("selector_hash"),
			blobField("verifier_salt"),
			blobField("verifier_hash"),
			integerField("failed_attempts"),
			nullable(textField("locked_until")),
			textField("issued_at"),
			nullable(textField("last_used_at")),
			nullable(textField("revoked_at")),
		},
	},
	{
		Name:    "auth_sessions",
		OrderBy: []string{"id"},
		Fields: []logicalField{
			textField("id"),
			textField("account_id"),
			textField("credential_id"),
			blobField("token_hash"),
			textField("created_at"),
			textField("expires_at"),
			textField("last_seen_at"),
			nullable(textField("revoked_at")),
		},
	},
	{
		Name:    "auth_audit_events",
		OrderBy: []string{"id"},
		Fields: []logicalField{
			textField("id"),
			nullable(textField("account_id")),
			nullable(textField("credential_id")),
			nullable(textField("session_id")),
			textField("event_type"),
			nullable(textField("detail_code")),
			textField("occurred_at"),
		},
	},
	{
		Name:    "auth_password_credentials",
		OrderBy: []string{"id"},
		Fields: []logicalField{
			textField("id"),
			textField("account_id"),
			textField("email_identity"),
			blobField("verifier_salt"),
			blobField("verifier_hash"),
			integerField("must_change"),
			integerField("failed_attempts"),
			nullable(textField("locked_until")),
			textField("issued_at"),
			nullable(textField("last_used_at")),
			nullable(textField("revoked_at")),
		},
	},
	{
		// The ciphertext restores with the data, but it is useless without the
		// key, which lives in the environment and never in an archive.
		Name:    "auth_totp_enrollments",
		OrderBy: []string{"id"},
		Fields: []logicalField{
			textField("id"),
			textField("account_id"),
			blobField("secret_ciphertext"),
			blobField("secret_nonce"),
			nullable(textField("confirmed_at")),
			nullable(integerField("last_used_step")),
			textField("issued_at"),
			nullable(textField("revoked_at")),
		},
	},
	{
		Name:    "auth_recovery_codes",
		OrderBy: []string{"id"},
		Fields: []logicalField{
			textField("id"),
			textField("account_id"),
			blobField("code_hash"),
			textField("issued_at"),
			nullable(textField("used_at")),
		},
	},
	{
		Name:    "staff_setup_tokens",
		OrderBy: []string{"id"},
		Fields: []logicalField{
			textField("id"),
			textField("account_id"),
			blobField("token_hash"),
			textField("issued_at"),
			textField("expires_at"),
			nullable(textField("consumed_at")),
		},
	},
	{
		Name:    "staff_sessions",
		OrderBy: []string{"id"},
		Fields: []logicalField{
			textField("id"),
			textField("account_id"),
			blobField("token_hash"),
			textField("created_at"),
			textField("expires_at"),
			textField("idle_expires_at"),
			textField("authenticated_at"),
			nullable(textField("revoked_at")),
		},
	},
	{
		Name:    "staff_sign_in_challenges",
		OrderBy: []string{"id"},
		Fields: []logicalField{
			textField("id"),
			textField("account_id"),
			blobField("token_hash"),
			textField("purpose"),
			textField("created_at"),
			textField("expires_at"),
			nullable(textField("consumed_at")),
		},
	},
	{
		Name:    "admin_audit_events",
		OrderBy: []string{"id"},
		Fields: []logicalField{
			textField("id"),
			// Absent on any action with no signed-in account behind it, which
			// actor_source names instead. An export that dropped either would
			// restore a trail that misattributes CLI work to nobody at all.
			nullable(textField("actor_account_id")),
			textField("actor_source"),
			textField("action"),
			textField("target_type"),
			textField("target_id"),
			withDefault(textField("detail_json"), "{}"),
			textField("occurred_at"),
		},
	},
}

func logicalTableByName(name string) (logicalTable, bool) {
	for _, table := range logicalTables {
		if table.Name == name {
			return table, true
		}
	}
	return logicalTable{}, false
}

func (table logicalTable) field(name string) (logicalField, bool) {
	for _, candidate := range table.Fields {
		if candidate.Name == name {
			return candidate, true
		}
	}
	return logicalField{}, false
}
