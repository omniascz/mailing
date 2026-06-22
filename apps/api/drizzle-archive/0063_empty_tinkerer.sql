CREATE TYPE "public"."billing_type" AS ENUM('contact_based', 'send_based', 'payg');--> statement-breakpoint
CREATE TYPE "public"."call_status" AS ENUM('initiated', 'ringing', 'in_progress', 'completed', 'no_answer', 'busy', 'voicemail', 'failed');--> statement-breakpoint
CREATE TYPE "public"."custom_field_type" AS ENUM('text', 'number', 'date', 'select', 'boolean');--> statement-breakpoint
CREATE TYPE "public"."data_region" AS ENUM('us', 'eu', 'ap');--> statement-breakpoint
CREATE TYPE "public"."lifecycle_stage" AS ENUM('subscriber', 'lead', 'marketing_qualified_lead', 'sales_qualified_lead', 'opportunity', 'customer', 'evangelist', 'other');--> statement-breakpoint
CREATE TYPE "public"."message_stream" AS ENUM('broadcast', 'transactional', 'triggered');--> statement-breakpoint
CREATE TYPE "public"."import_job_format" AS ENUM('csv', 'xlsx');--> statement-breakpoint
CREATE TYPE "public"."import_job_status" AS ENUM('uploaded', 'mapped', 'processing', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."frequency_channel" AS ENUM('email', 'sms', 'push', 'whatsapp', 'voice', 'all');--> statement-breakpoint
CREATE TYPE "public"."alert_severity" AS ENUM('info', 'warning', 'critical');--> statement-breakpoint
CREATE TYPE "public"."alert_type" AS ENUM('bounce_rate_spike', 'complaint_rate_spike', 'open_rate_drop', 'unsub_spike');--> statement-breakpoint
CREATE TYPE "public"."ai_feature" AS ENUM('segment_from_description', 'generate_email', 'subject_lines', 'brand_voice', 'campaign_summary', 'translate', 'html_to_blocks', 'product_scraper', 'accessibility_check', 'other');--> statement-breakpoint
CREATE TYPE "public"."workflow_run_status" AS ENUM('pending', 'running', 'waiting', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."workflow_status" AS ENUM('draft', 'active', 'inactive', 'archived');--> statement-breakpoint
CREATE TYPE "public"."workflow_trigger_type" AS ENUM('list_subscribe', 'tag_added', 'date_field', 'api_event', 'form_submit', 'purchase_event', 'manual', 'loyalty_points_earned', 'loyalty_tier_up', 'loyalty_reward_redeemed', 'name_day_today', 'lifecycle_stage_changed', 'n_days_before_holiday');--> statement-breakpoint
CREATE TYPE "public"."webhook_delivery_status" AS ENUM('pending', 'success', 'failed', 'retrying');--> statement-breakpoint
CREATE TYPE "public"."embed_type" AS ENUM('inline', 'popup', 'slide', 'floating');--> statement-breakpoint
CREATE TYPE "public"."migration_job_status" AS ENUM('pending', 'running', 'completed', 'failed', 'cancelled', 'rolled_back');--> statement-breakpoint
CREATE TYPE "public"."wa_conversation_category" AS ENUM('marketing', 'utility', 'authentication', 'service');--> statement-breakpoint
CREATE TYPE "public"."wa_quality_rating" AS ENUM('GREEN', 'YELLOW', 'RED', 'UNKNOWN');--> statement-breakpoint
CREATE TYPE "public"."wa_template_category" AS ENUM('marketing', 'utility', 'authentication');--> statement-breakpoint
CREATE TYPE "public"."wa_template_status" AS ENUM('draft', 'pending', 'approved', 'rejected', 'paused', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."in_app_position" AS ENUM('top', 'bottom', 'center', 'left', 'right');--> statement-breakpoint
CREATE TYPE "public"."in_app_widget_type" AS ENUM('banner', 'modal', 'slideout');--> statement-breakpoint
CREATE TYPE "public"."product_feed_format" AS ENUM('heureka', 'zbozi', 'google_shopping', 'custom_xml');--> statement-breakpoint
CREATE TYPE "public"."blog_post_status" AS ENUM('draft', 'published', 'scheduled', 'archived');--> statement-breakpoint
CREATE TYPE "public"."cta_type" AS ENUM('button', 'banner', 'popup', 'inline', 'exit_intent');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('pending', 'approved', 'rejected', 'spam');--> statement-breakpoint
CREATE TYPE "public"."agent_run_status" AS ENUM('pending', 'running', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."agent_status" AS ENUM('active', 'paused', 'archived');--> statement-breakpoint
CREATE TYPE "public"."mv_test_status" AS ENUM('draft', 'running', 'selecting_winner', 'winner_selected', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."mv_variant_element" AS ENUM('subject', 'preheader', 'from_name', 'content', 'send_time');--> statement-breakpoint
CREATE TYPE "public"."mv_winner_metric" AS ENUM('open_rate', 'click_rate', 'click_to_open_rate', 'conversion_rate', 'revenue_per_email');--> statement-breakpoint
CREATE TYPE "public"."ip_pool_type" AS ENUM('marketing', 'transactional', 'cold_outreach', 'warming', 'shared', 'dedicated');--> statement-breakpoint
CREATE TYPE "public"."dedicated_ip_status" AS ENUM('pending', 'provisioning', 'active', 'warming', 'warm', 'suspended', 'retired');--> statement-breakpoint
CREATE TYPE "public"."abuse_action" AS ENUM('none', 'alert', 'throttle', 'pause_campaigns', 'suspend_sending', 'suspend_account', 'require_review');--> statement-breakpoint
CREATE TYPE "public"."abuse_event_status" AS ENUM('open', 'acknowledged', 'investigating', 'resolved', 'false_positive');--> statement-breakpoint
CREATE TYPE "public"."abuse_severity" AS ENUM('info', 'low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."abuse_signal_type" AS ENUM('high_bounce_rate', 'high_complaint_rate', 'spam_trap_hit', 'honeypot_hit', 'volume_spike', 'list_quality_low', 'new_account_high_volume', 'blacklist_hit', 'content_spam_score', 'suspicious_login', 'api_abuse', 'credential_stuffing', 'stale_list_send');--> statement-breakpoint
CREATE TYPE "public"."isp_provider" AS ENUM('gmail', 'microsoft', 'yahoo', 'aol', 'comcast', 'seznam', 'volny', 'centrum', 'other');--> statement-breakpoint
CREATE TYPE "public"."ecommerce_connection_status" AS ENUM('pending', 'active', 'paused', 'error', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."ecommerce_platform" AS ENUM('shopify', 'woocommerce', 'bigcommerce', 'magento', 'prestashop', 'shoptet', 'upgates', 'fastcentrik');--> statement-breakpoint
CREATE TYPE "public"."deal_status" AS ENUM('open', 'won', 'lost');--> statement-breakpoint
CREATE TYPE "public"."crm_task_priority" AS ENUM('low', 'medium', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."crm_task_status" AS ENUM('open', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."crm_task_type" AS ENUM('call', 'email', 'meeting', 'todo');--> statement-breakpoint
CREATE TYPE "public"."sequence_enrollment_status" AS ENUM('active', 'paused', 'completed', 'replied', 'unsubscribed', 'bounced', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."sequence_step_type" AS ENUM('email', 'personal_email', 'wait', 'task', 'sms', 'linkedin');--> statement-breakpoint
CREATE TYPE "public"."site_message_trigger" AS ENUM('page_visit', 'time_on_site', 'exit_intent', 'scroll_depth', 'cart_value', 'returning_visitor', 'segment_match', 'custom_event');--> statement-breakpoint
CREATE TYPE "public"."site_message_type" AS ENUM('popup', 'banner', 'slide_in', 'full_screen');--> statement-breakpoint
CREATE TYPE "public"."web_personalization_action" AS ENUM('hide', 'show', 'swap_text', 'swap_html', 'add_class', 'remove_class', 'set_attr');--> statement-breakpoint
CREATE TYPE "public"."loyalty_point_expiry_type" AS ENUM('never', 'rolling', 'fixed');--> statement-breakpoint
CREATE TYPE "public"."loyalty_member_status" AS ENUM('active', 'suspended', 'opted_out');--> statement-breakpoint
CREATE TYPE "public"."loyalty_point_tx_type" AS ENUM('earn', 'redeem', 'expire', 'adjust', 'bonus', 'refund');--> statement-breakpoint
CREATE TYPE "public"."loyalty_reward_type" AS ENUM('discount_pct', 'discount_fixed', 'free_product', 'voucher', 'experience');--> statement-breakpoint
CREATE TYPE "public"."loyalty_earning_event" AS ENUM('purchase', 'signup', 'birthday', 'referral', 'review', 'social_share', 'profile_complete', 'custom_event');--> statement-breakpoint
CREATE TYPE "public"."baa_status" AS ENUM('pending', 'active', 'expired', 'terminated');--> statement-breakpoint
CREATE TYPE "public"."calc_prop_entity" AS ENUM('contact', 'deal', 'account');--> statement-breakpoint
CREATE TYPE "public"."calc_prop_result_type" AS ENUM('number', 'string', 'boolean', 'date');--> statement-breakpoint
CREATE TYPE "public"."crm_sync_entity" AS ENUM('contact', 'deal', 'account');--> statement-breakpoint
CREATE TYPE "public"."crm_sync_provider" AS ENUM('hubspot', 'salesforce', 'pipedrive');--> statement-breakpoint
CREATE TYPE "public"."crm_sync_direction" AS ENUM('in', 'out', 'both');--> statement-breakpoint
CREATE TYPE "public"."data_pipeline_source" AS ENUM('contacts', 'email_events', 'deals', 'orders', 'cdp_events');--> statement-breakpoint
CREATE TYPE "public"."data_pipeline_status" AS ENUM('draft', 'active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."data_pipeline_trigger" AS ENUM('manual', 'scheduled', 'event');--> statement-breakpoint
CREATE TYPE "public"."newsletter_subscription_status" AS ENUM('active', 'past_due', 'canceled', 'trialing', 'paused');--> statement-breakpoint
CREATE TYPE "public"."referral_reward_type" AS ENUM('tier_upgrade', 'loyalty_points', 'stripe_credit', 'webhook', 'none');--> statement-breakpoint
CREATE TYPE "public"."playbook_run_status" AS ENUM('in_progress', 'completed', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."playbook_step_type" AS ENUM('call', 'email', 'linkedin', 'meeting', 'task', 'question', 'note');--> statement-breakpoint
CREATE TYPE "public"."rotation_entity_type" AS ENUM('deal', 'contact', 'ticket', 'lead');--> statement-breakpoint
CREATE TYPE "public"."rotation_strategy" AS ENUM('round_robin', 'load_balanced', 'random');--> statement-breakpoint
CREATE TYPE "public"."intent_signal_source" AS ENUM('first_party', 'bombora', '6sense', 'clearbit', 'manual');--> statement-breakpoint
CREATE TYPE "public"."intent_signal_type" AS ENUM('pricing_page_visit', 'case_study_view', 'demo_request_page', 'comparison_page', 'product_page_visit', 'content_download', 'webinar_attended', 'bombora_surge', 'sixsense_intent', 'job_posting_signal', 'tech_stack_change', 'funding_event', 'executive_change', 'email_click_buying_signal', 'chat_started', 'trial_started');--> statement-breakpoint
CREATE TYPE "public"."ad_placement_type" AS ENUM('banner', 'sponsored_section', 'native_content', 'classified');--> statement-breakpoint
CREATE TYPE "public"."ad_status" AS ENUM('pending', 'approved', 'active', 'paused', 'completed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."persona_type" AS ENUM('champion', 'loyal', 'deal_hunter', 'window_shopper', 'seasonal', 'at_risk', 'dormant', 'new_subscriber', 'vip', 'complainer');--> statement-breakpoint
CREATE TYPE "public"."zp_data_type" AS ENUM('product_interest', 'communication_frequency', 'preferred_channel', 'content_preference', 'budget_range', 'purchase_intent', 'birthday', 'anniversary', 'location', 'custom');--> statement-breakpoint
CREATE TYPE "public"."consent_event_type" AS ENUM('opt_in', 'double_opt_in', 'opt_out', 'preference_update', 'purpose_added', 'purpose_removed', 'consent_withdrawn', 'data_export', 're_consent');--> statement-breakpoint
CREATE TYPE "public"."consent_legal_basis" AS ENUM('consent', 'legitimate_interest', 'contract', 'legal_obligation');--> statement-breakpoint
CREATE TYPE "public"."co_marketing_status" AS ENUM('draft', 'invited', 'accepted', 'rejected', 'active', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."dc_trigger_type" AS ENUM('time_of_day', 'day_of_week', 'days_since_send', 'stock_level', 'weather', 'contact_prop', 'geo', 'countdown', 'live_price', 'custom_api');--> statement-breakpoint
CREATE TYPE "public"."paywall_tier" AS ENUM('free', 'basic', 'premium', 'vip');--> statement-breakpoint
ALTER TYPE "public"."auth_provider" ADD VALUE 'sso';--> statement-breakpoint
ALTER TYPE "public"."campaign_type" ADD VALUE 'viber';--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE 'system_admin';--> statement-breakpoint
CREATE TABLE "lifecycle_stage_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"from_stage" "lifecycle_stage",
	"to_stage" "lifecycle_stage" NOT NULL,
	"changed_by" uuid,
	"reason" varchar(255),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"created_by" uuid,
	"filename" varchar(255) NOT NULL,
	"format" "import_job_format" NOT NULL,
	"file_size" integer NOT NULL,
	"storage_path" varchar(512) NOT NULL,
	"status" "import_job_status" DEFAULT 'uploaded' NOT NULL,
	"detected_columns" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sample_rows" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"column_mapping" jsonb,
	"default_list_id" uuid,
	"total_rows" integer DEFAULT 0 NOT NULL,
	"processed_rows" integer DEFAULT 0 NOT NULL,
	"inserted_rows" integer DEFAULT 0 NOT NULL,
	"updated_rows" integer DEFAULT 0 NOT NULL,
	"skipped_rows" integer DEFAULT 0 NOT NULL,
	"error_rows" integer DEFAULT 0 NOT NULL,
	"errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "segments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" varchar(1000),
	"conditions" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "frequency_suppressions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"contact_id" uuid,
	"channel" varchar(16) NOT NULL,
	"reason" varchar(32) NOT NULL,
	"rule_id" uuid,
	"priority" varchar(16),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"suppressed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org_frequency_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"channel" "frequency_channel" NOT NULL,
	"max_count" integer NOT NULL,
	"period_hours" integer NOT NULL,
	"quiet_hours_start" smallint,
	"quiet_hours_end" smallint,
	"timezone" varchar(64),
	"engagement_band" varchar(20),
	"priority_floor" varchar(16),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_field_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"key" varchar(100) NOT NULL,
	"field_type" "custom_field_type" NOT NULL,
	"options" jsonb,
	"required" boolean DEFAULT false NOT NULL,
	"default_value" varchar(1000),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brand_kits" (
	"org_id" uuid PRIMARY KEY NOT NULL,
	"logo_url" varchar(1024),
	"primary_color" varchar(7) DEFAULT '#2563eb',
	"secondary_color" varchar(7) DEFAULT '#1e40af',
	"accent_color" varchar(7) DEFAULT '#f59e0b',
	"font_heading" varchar(100) DEFAULT 'Arial, Helvetica, sans-serif',
	"font_body" varchar(100) DEFAULT 'Arial, Helvetica, sans-serif',
	"footer_text" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"created_by" uuid,
	"name" varchar(255) NOT NULL,
	"category" varchar(100) DEFAULT 'uncategorized' NOT NULL,
	"block_data" jsonb NOT NULL,
	"thumbnail_url" varchar(1024),
	"locale" varchar(8) DEFAULT 'en' NOT NULL,
	"translation_group_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sending_domains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"domain" varchar(253) NOT NULL,
	"mail_subdomain" varchar(253),
	"dkim_selector" varchar(63) DEFAULT 'fm1' NOT NULL,
	"dkim_private_key" text,
	"dkim_public_key" text,
	"dkim_verified" boolean DEFAULT false NOT NULL,
	"dkim_verified_at" timestamp with time zone,
	"spf_verified" boolean DEFAULT false NOT NULL,
	"spf_verified_at" timestamp with time zone,
	"dmarc_verified" boolean DEFAULT false NOT NULL,
	"dmarc_verified_at" timestamp with time zone,
	"return_path_verified" boolean DEFAULT false NOT NULL,
	"return_path_verified_at" timestamp with time zone,
	"is_verified" boolean DEFAULT false NOT NULL,
	"warmup_status" varchar(20) DEFAULT 'cold' NOT NULL,
	"warmup_started_at" timestamp with time zone,
	"warmup_completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warmup_ips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid,
	"ip_address" varchar(45) NOT NULL,
	"warmup_day" integer DEFAULT 0 NOT NULL,
	"today_sent" integer DEFAULT 0 NOT NULL,
	"current_date" varchar(10) DEFAULT '' NOT NULL,
	"status" varchar(20) DEFAULT 'cold' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"campaign_id" uuid,
	"alert_type" "alert_type" NOT NULL,
	"severity" "alert_severity" DEFAULT 'warning' NOT NULL,
	"message" varchar(1024) NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"acknowledged" boolean DEFAULT false NOT NULL,
	"acknowledged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inbox_preview_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"campaign_id" uuid,
	"provider" varchar(32) NOT NULL,
	"provider_job_id" varchar(128),
	"subject" varchar(255),
	"html" text NOT NULL,
	"clients" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"results" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ai_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"model" varchar(100) NOT NULL,
	"feature" "ai_feature" DEFAULT 'other' NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" numeric(10, 6) DEFAULT '0' NOT NULL,
	"cached" varchar(5) DEFAULT 'false' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"contact_id" uuid,
	"event_name" varchar(255) NOT NULL,
	"properties" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"processed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"contact_id" uuid,
	"status" "workflow_run_status" DEFAULT 'pending' NOT NULL,
	"current_node_id" varchar(255),
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"next_execution_at" timestamp with time zone,
	"error_message" varchar(2048),
	"split_branch" varchar(100),
	"converted" boolean DEFAULT false NOT NULL,
	"converted_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" varchar(1024),
	"status" "workflow_status" DEFAULT 'draft' NOT NULL,
	"nodes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"edges" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"trigger_type" "workflow_trigger_type" DEFAULT 'manual' NOT NULL,
	"trigger_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"total_runs" integer DEFAULT 0 NOT NULL,
	"completed_runs" integer DEFAULT 0 NOT NULL,
	"failed_runs" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "lead_score_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"event_type" varchar(100) NOT NULL,
	"points_delta" integer NOT NULL,
	"score_after" integer NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_score_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"event_type" varchar(100) NOT NULL,
	"points" integer NOT NULL,
	"decay_days" integer DEFAULT 90 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"description" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid,
	"name" varchar(255) NOT NULL,
	"key_hash" varchar(255) NOT NULL,
	"key_prefix" varchar(16) NOT NULL,
	"scopes" text[] DEFAULT '{}'::text[] NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"mode" varchar(8) DEFAULT 'live' NOT NULL,
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"webhook_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"event" varchar(100) NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "webhook_delivery_status" DEFAULT 'pending' NOT NULL,
	"status_code" integer,
	"response_body" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_retry_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"url" varchar(2048) NOT NULL,
	"secret" varchar(255) NOT NULL,
	"events" text[] DEFAULT '{}'::text[] NOT NULL,
	"description" varchar(255),
	"active" boolean DEFAULT true NOT NULL,
	"priority" integer DEFAULT 5 NOT NULL,
	"batch_size" integer DEFAULT 1 NOT NULL,
	"batch_flush_seconds" integer DEFAULT 30 NOT NULL,
	"total_deliveries" integer DEFAULT 0 NOT NULL,
	"failed_deliveries" integer DEFAULT 0 NOT NULL,
	"last_delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "migration_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"type" varchar(50) NOT NULL,
	"status" "migration_job_status" DEFAULT 'pending' NOT NULL,
	"progress" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error_message" varchar(2048),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "signup_form_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"form_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"contact_id" uuid,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip_address" varchar(45),
	"user_agent" varchar(512),
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signup_form_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"form_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"traffic_split" integer DEFAULT 50 NOT NULL,
	"fields" jsonb,
	"config" jsonb,
	"active" boolean DEFAULT true NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"submit_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signup_forms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"list_id" uuid,
	"name" varchar(255) NOT NULL,
	"fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"embed_type" "embed_type" DEFAULT 'inline' NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"submit_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sms_consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"phone" text NOT NULL,
	"contact_id" uuid,
	"consent_source" text NOT NULL,
	"consent_context" text,
	"consented_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_via_keyword" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sms_inbound" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_message_id" text,
	"from_phone" text NOT NULL,
	"to_phone" text NOT NULL,
	"body" text NOT NULL,
	"contact_id" uuid,
	"keyword_action" text,
	"workflow_triggered" boolean DEFAULT false NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sms_routes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"country_code" text NOT NULL,
	"provider" text NOT NULL,
	"priority" integer DEFAULT 1 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"cost_per_sms" numeric(10, 6),
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sms_send_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"contact_id" uuid,
	"phone" text NOT NULL,
	"provider" text NOT NULL,
	"provider_message_id" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"segments" integer DEFAULT 1 NOT NULL,
	"cost_eur" numeric(10, 6),
	"campaign_id" uuid,
	"workflow_id" uuid,
	"error_code" text,
	"error_message" text,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"mms_url" text,
	"media_type" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"phone" text NOT NULL,
	"contact_id" uuid,
	"consent_source" text NOT NULL,
	"consent_context" text,
	"consented_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"phone_number_id" text NOT NULL,
	"contact_phone" text NOT NULL,
	"contact_id" uuid,
	"category" "wa_conversation_category" DEFAULT 'utility' NOT NULL,
	"window_expires_at" timestamp with time zone,
	"message_count" integer DEFAULT 0 NOT NULL,
	"last_message_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_phone_numbers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"phone_number_id" text NOT NULL,
	"display_phone" text,
	"quality_rating" "wa_quality_rating" DEFAULT 'GREEN' NOT NULL,
	"messaging_limit_tier" text DEFAULT '1000' NOT NULL,
	"conversations_last_24h" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"category" "wa_template_category" DEFAULT 'utility' NOT NULL,
	"language" text DEFAULT 'en_US' NOT NULL,
	"status" "wa_template_status" DEFAULT 'draft' NOT NULL,
	"components" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"meta_template_id" text,
	"rejection_reason" text,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"submitted_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_send_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"subscription_id" uuid,
	"contact_id" uuid,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"url" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"error_code" text,
	"error_message" text,
	"campaign_id" uuid,
	"image_url" text,
	"icon_url" text,
	"badge" text,
	"action_buttons" jsonb,
	"action_clicked" text,
	"clicked_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"contact_id" uuid,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"fcm_token" text,
	"active" boolean DEFAULT true NOT NULL,
	"unsubscribed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vapid_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"public_key" text NOT NULL,
	"private_key" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "in_app_impressions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"contact_id" uuid,
	"session_id" text,
	"page_url" text,
	"event_type" text DEFAULT 'shown' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "in_app_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"widget_type" "in_app_widget_type" DEFAULT 'banner' NOT NULL,
	"position" "in_app_position" DEFAULT 'bottom' NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"cta_label" text,
	"cta_url" text,
	"background_color" text DEFAULT '#ffffff',
	"text_color" text DEFAULT '#000000',
	"image_url" text,
	"targeting_rules" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"max_per_session" integer DEFAULT 1 NOT NULL,
	"max_total" integer DEFAULT 0 NOT NULL,
	"auto_close_seconds" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"campaign_id" uuid,
	"impressions" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"start_at" timestamp with time zone,
	"end_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"campaign_id" uuid,
	"contact_id" uuid NOT NULL,
	"agent_id" uuid,
	"deal_id" uuid,
	"scenario_id" uuid,
	"direction" varchar(16) DEFAULT 'outbound' NOT NULL,
	"from_number" varchar(32),
	"to_number" varchar(32),
	"status" "call_status" NOT NULL,
	"duration_seconds" integer DEFAULT 0 NOT NULL,
	"recording_url" varchar(1024),
	"transcript" text,
	"ai_summary" text,
	"outcome" jsonb,
	"cost" numeric(10, 4) DEFAULT '0.00' NOT NULL,
	"twilio_call_sid" varchar(255),
	"twilio_recording_sid" varchar(255),
	"voicemail_url" varchar(1024),
	"voicemail_transcript" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"folder" varchar(255) DEFAULT '/' NOT NULL,
	"filename" varchar(255) NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"width" integer,
	"height" integer,
	"storage_url" varchar(1024) NOT NULL,
	"thumbnail_url" varchar(1024),
	"alt_text" varchar(512),
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "survey_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"survey_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"contact_id" uuid,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"nps_score" integer,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "surveys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" varchar(1024),
	"questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"submit_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_groups" (
	"contact_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"kind" varchar(20) DEFAULT 'checkboxes' NOT NULL,
	"visible" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "revenue_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"contact_id" uuid,
	"order_id" varchar(128),
	"amount" numeric(14, 2) NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"utm_source" varchar(100),
	"utm_medium" varchar(100),
	"utm_campaign" varchar(100),
	"attributed_campaign_id" uuid,
	"attribution_model" varchar(20),
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"sku" varchar(128) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" varchar(2048),
	"price" numeric(12, 2) NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"image_url" varchar(1024),
	"url" varchar(1024),
	"categories" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"stock" integer,
	"active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_feeds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"format" "product_feed_format" NOT NULL,
	"url" text NOT NULL,
	"username" varchar(128),
	"password" text,
	"poll_interval_minutes" integer DEFAULT 60 NOT NULL,
	"last_synced_at" timestamp with time zone,
	"last_error" text,
	"last_item_count" integer,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blog_authors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid,
	"slug" varchar(128) NOT NULL,
	"display_name" varchar(255) NOT NULL,
	"bio" text,
	"avatar_url" text,
	"social_links" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blog_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"slug" varchar(128) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"parent_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blog_post_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"version" varchar(16) NOT NULL,
	"title" varchar(255) NOT NULL,
	"body" text NOT NULL,
	"excerpt" text,
	"saved_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blog_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"author_id" uuid,
	"category_id" uuid,
	"slug" varchar(255) NOT NULL,
	"title" varchar(255) NOT NULL,
	"excerpt" text,
	"body" text NOT NULL,
	"hero_image_url" text,
	"translation_group_id" uuid,
	"locale" varchar(16) DEFAULT 'en' NOT NULL,
	"status" "blog_post_status" DEFAULT 'draft' NOT NULL,
	"meta_title" varchar(255),
	"meta_description" varchar(512),
	"canonical_url" text,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"published_at" timestamp with time zone,
	"scheduled_publish_at" timestamp with time zone,
	"version" varchar(16) DEFAULT '1' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "cta_impressions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"cta_id" uuid NOT NULL,
	"variant_id" uuid,
	"visitor_id" varchar(128),
	"contact_id" uuid,
	"clicked" boolean DEFAULT false NOT NULL,
	"dismissed" boolean DEFAULT false NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cta_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cta_id" uuid NOT NULL,
	"name" varchar(128) NOT NULL,
	"weight" integer DEFAULT 1 NOT NULL,
	"content" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ctas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"type" "cta_type" DEFAULT 'button' NOT NULL,
	"content" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"conditions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"ab_rotation_mode" varchar(16),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "saved_queries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"owner_user_id" uuid,
	"name" varchar(255) NOT NULL,
	"description" text,
	"question" text NOT NULL,
	"visibility" varchar(16) DEFAULT 'org' NOT NULL,
	"last_sql" text,
	"last_chart_type" varchar(32),
	"run_count" integer DEFAULT 0 NOT NULL,
	"last_run_at" timestamp with time zone,
	"last_run_duration_ms" integer,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "two_factor_secrets" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"secret" varchar(64) NOT NULL,
	"backup_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_apps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"client_id" varchar(64) NOT NULL,
	"client_secret_hash" varchar(256) NOT NULL,
	"redirect_uris" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "oauth_apps_client_id_unique" UNIQUE("client_id")
);
--> statement-breakpoint
CREATE TABLE "oauth_codes" (
	"code" varchar(64) PRIMARY KEY NOT NULL,
	"app_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"redirect_uri" varchar(1024) NOT NULL,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" varchar(256) NOT NULL,
	"refresh_token_hash" varchar(256),
	"app_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "oauth_tokens_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "oauth_tokens_refresh_token_hash_unique" UNIQUE("refresh_token_hash")
);
--> statement-breakpoint
CREATE TABLE "rss_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"feed_url" varchar(1024) NOT NULL,
	"list_id" uuid,
	"frequency" varchar(20) DEFAULT 'daily' NOT NULL,
	"send_time" varchar(5) DEFAULT '09:00' NOT NULL,
	"timezone" varchar(100) DEFAULT 'UTC' NOT NULL,
	"from_name" varchar(100),
	"from_email" varchar(255),
	"subject_template" varchar(255) DEFAULT '{{rss.title}}' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"last_seen_guids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_sent_at" timestamp with time zone,
	"next_run_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_engagement" (
	"contact_id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"timezone" varchar(100),
	"open_hour_histogram" jsonb DEFAULT '[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]'::jsonb NOT NULL,
	"open_day_histogram" jsonb DEFAULT '[0,0,0,0,0,0,0]'::jsonb NOT NULL,
	"total_opens" integer DEFAULT 0 NOT NULL,
	"total_clicks" integer DEFAULT 0 NOT NULL,
	"total_sends" integer DEFAULT 0 NOT NULL,
	"total_orders" integer DEFAULT 0 NOT NULL,
	"total_revenue" numeric(14, 2) DEFAULT '0' NOT NULL,
	"last_order_at" timestamp with time zone,
	"first_order_at" timestamp with time zone,
	"predicted_clv" numeric(14, 2),
	"purchase_likelihood" numeric(4, 3),
	"churn_risk" numeric(4, 3),
	"predicted_at" timestamp with time zone,
	"rfm_recency" integer,
	"rfm_frequency" integer,
	"rfm_monetary" integer,
	"rfm_score" integer,
	"rfm_segment" varchar(32),
	"predicted_next_order_at" timestamp with time zone,
	"avg_order_interval_days" integer,
	"email_score" integer,
	"sms_score" integer,
	"whatsapp_score" integer,
	"voice_score" integer,
	"push_score" integer,
	"preferred_channel" varchar(16),
	"channel_scored_at" timestamp with time zone,
	"engagement_score" integer,
	"engagement_band" varchar(20),
	"engagement_scored_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"email" varchar(320) NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"consent" varchar(32) DEFAULT 'pending' NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_channel_consents" (
	"org_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"channel" varchar(32) NOT NULL,
	"opted_in" boolean DEFAULT false NOT NULL,
	"source" varchar(64) NOT NULL,
	"consent_text" text,
	"ip_address" varchar(45),
	"user_agent" varchar(1024),
	"consented_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoke_reason" varchar(255),
	"imported_from" varchar(64),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_channel_consents_contact_id_channel_pk" PRIMARY KEY("contact_id","channel")
);
--> statement-breakpoint
CREATE TABLE "contact_send_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"channel" varchar(32) NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "smart_sending_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"channel" varchar(32) NOT NULL,
	"max_per_day" integer DEFAULT 2 NOT NULL,
	"max_per_week" integer DEFAULT 7 NOT NULL,
	"cooldown_hours" integer DEFAULT 16 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quiet_hours" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"channel" varchar(32) DEFAULT 'all' NOT NULL,
	"start_hour" integer DEFAULT 21 NOT NULL,
	"end_hour" integer DEFAULT 8 NOT NULL,
	"timezone" varchar(100) DEFAULT 'UTC' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "back_in_stock_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"sku" varchar(128) NOT NULL,
	"channel" varchar(32) DEFAULT 'email' NOT NULL,
	"notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_drop_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"sku" varchar(128) NOT NULL,
	"channel" varchar(32) DEFAULT 'email' NOT NULL,
	"price_at_subscribe" numeric(12, 2) NOT NULL,
	"notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coupon_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"code_prefix" varchar(32) DEFAULT '' NOT NULL,
	"discount_type" varchar(16) DEFAULT 'percent' NOT NULL,
	"discount_value" numeric(10, 2) NOT NULL,
	"expires_at" timestamp with time zone,
	"total_codes" integer DEFAULT 0 NOT NULL,
	"redeemed_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coupon_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"code" varchar(64) NOT NULL,
	"assigned_to" uuid,
	"assigned_at" timestamp with time zone,
	"redeemed_at" timestamp with time zone,
	"revenue" numeric(12, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"sku" varchar(128) NOT NULL,
	"contact_id" uuid,
	"rating" integer NOT NULL,
	"title" varchar(255),
	"body" text,
	"author_name" varchar(255),
	"photos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"contact_id" uuid,
	"order_id" varchar(128),
	"product_sku" varchar(128),
	"token" varchar(64) NOT NULL,
	"review_id" uuid,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone,
	"expires_at" timestamp with time zone DEFAULT now() + interval '60 days' NOT NULL,
	CONSTRAINT "review_requests_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"contact_id" uuid,
	"product_sku" varchar(128),
	"product_name" varchar(255),
	"order_id" varchar(128),
	"rating" smallint NOT NULL,
	"title" varchar(255),
	"body" text NOT NULL,
	"status" "review_status" DEFAULT 'pending' NOT NULL,
	"sentiment" varchar(16),
	"sentiment_score" numeric(4, 3),
	"source" varchar(32) DEFAULT 'public_form' NOT NULL,
	"moderation_reason" varchar(255),
	"moderated_by_user_id" uuid,
	"moderated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "scheduled_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"report_type" varchar(64) NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"recipients" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"frequency" varchar(16) DEFAULT 'weekly' NOT NULL,
	"next_run_at" timestamp with time zone NOT NULL,
	"last_run_at" timestamp with time zone,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "holdout_group_members" (
	"group_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "holdout_group_members_group_id_contact_id_pk" PRIMARY KEY("group_id","contact_id")
);
--> statement-breakpoint
CREATE TABLE "holdout_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" varchar(1024),
	"percentage" numeric(5, 2) DEFAULT '5' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "helpdesk_tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"contact_id" uuid,
	"subject" varchar(512) NOT NULL,
	"status" varchar(32) DEFAULT 'open' NOT NULL,
	"priority" varchar(16) DEFAULT 'normal' NOT NULL,
	"channel" varchar(32) DEFAULT 'email' NOT NULL,
	"external_thread_id" varchar(255),
	"external_identity" varchar(255),
	"channel_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"assigned_to" uuid,
	"team_id" uuid,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"sender" varchar(32) NOT NULL,
	"direction" varchar(16) DEFAULT 'inbound' NOT NULL,
	"external_message_id" varchar(255),
	"body" text NOT NULL,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warehouse_syncs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"destination" varchar(64) NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"entities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"frequency" varchar(16) DEFAULT 'daily' NOT NULL,
	"last_sync_at" timestamp with time zone,
	"last_status" varchar(32),
	"last_error" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sms_keywords" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"keyword" varchar(32) NOT NULL,
	"action" varchar(32) NOT NULL,
	"list_id" uuid,
	"reply" varchar(1024),
	"enabled" boolean DEFAULT true NOT NULL,
	"hit_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "anonymous_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"visitor_id" varchar(128) NOT NULL,
	"device_id" varchar(128),
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"merged_into" uuid,
	"merged_at" timestamp with time zone,
	"properties" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip_prefix" varchar(16),
	"user_agent_hash" varchar(64),
	"accept_language_hash" varchar(64),
	"locale" varchar(16),
	"screen_sig" varchar(32)
);
--> statement-breakpoint
CREATE TABLE "rcs_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"contact_id" uuid,
	"phone" varchar(32) NOT NULL,
	"message_type" varchar(32) DEFAULT 'text' NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" varchar(32) DEFAULT 'queued' NOT NULL,
	"provider" varchar(32),
	"provider_id" varchar(128),
	"error" text,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ip_restrictions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"cidr" varchar(50) NOT NULL,
	"label" varchar(100),
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "viber_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"type" varchar(20) DEFAULT 'text' NOT NULL,
	"body" text NOT NULL,
	"media_url" varchar(2048),
	"action_url" varchar(2048),
	"action_text" varchar(255),
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"provider" varchar(20),
	"provider_template_id" varchar(255),
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"status" "agent_run_status" DEFAULT 'pending' NOT NULL,
	"input" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"output" jsonb,
	"error" text,
	"tokens_used" integer,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"agent_type" varchar(50) NOT NULL,
	"description" text,
	"goal" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "agent_status" DEFAULT 'active' NOT NULL,
	"schedule" varchar(100),
	"last_run_at" timestamp with time zone,
	"next_run_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "multivariate_tests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"status" "mv_test_status" DEFAULT 'draft' NOT NULL,
	"winner_metric" "mv_winner_metric" DEFAULT 'open_rate' NOT NULL,
	"test_audience_percent" integer DEFAULT 30 NOT NULL,
	"test_window_hours" integer DEFAULT 4 NOT NULL,
	"winner_select_at" timestamp with time zone,
	"winner_variant_id" uuid,
	"auto_send_winner" boolean DEFAULT true NOT NULL,
	"confidence_threshold" numeric(5, 2) DEFAULT '95' NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mv_test_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"test_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"is_control" boolean DEFAULT false NOT NULL,
	"element" "mv_variant_element" DEFAULT 'subject' NOT NULL,
	"value" jsonb NOT NULL,
	"allocation_percent" numeric(5, 2) DEFAULT '50' NOT NULL,
	"total_sent" integer DEFAULT 0 NOT NULL,
	"total_delivered" integer DEFAULT 0 NOT NULL,
	"total_opens" integer DEFAULT 0 NOT NULL,
	"unique_opens" integer DEFAULT 0 NOT NULL,
	"total_clicks" integer DEFAULT 0 NOT NULL,
	"unique_clicks" integer DEFAULT 0 NOT NULL,
	"total_conversions" integer DEFAULT 0 NOT NULL,
	"total_revenue" numeric(12, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mv_variant_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"test_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dedicated_ips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ip_address" varchar(45) NOT NULL,
	"ptr_record" varchar(253),
	"org_id" uuid,
	"pool_id" uuid,
	"status" "dedicated_ip_status" DEFAULT 'pending' NOT NULL,
	"warmup_day" integer DEFAULT 0 NOT NULL,
	"warmup_sent" integer DEFAULT 0 NOT NULL,
	"warmup_started_at" timestamp with time zone,
	"warmup_completed_at" timestamp with time zone,
	"today_sent" integer DEFAULT 0 NOT NULL,
	"total_sent" integer DEFAULT 0 NOT NULL,
	"reputation_score" numeric(5, 2) DEFAULT '0' NOT NULL,
	"reputation_updated_at" timestamp with time zone,
	"blacklist_count" integer DEFAULT 0 NOT NULL,
	"bounce_rate" numeric(5, 2) DEFAULT '0' NOT NULL,
	"complaint_rate" numeric(5, 2) DEFAULT '0' NOT NULL,
	"region" varchar(20) DEFAULT 'us-east' NOT NULL,
	"notes" text,
	"allocated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ip_pools" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"type" "ip_pool_type" DEFAULT 'marketing' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"allowed_campaign_types" varchar(255) DEFAULT 'email' NOT NULL,
	"per_ip_daily_limit" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ip_warmup_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pool_id" uuid NOT NULL,
	"day" integer NOT NULL,
	"max_volume" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "abuse_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"rule_id" uuid,
	"signal_type" "abuse_signal_type" NOT NULL,
	"severity" "abuse_severity" NOT NULL,
	"observed_value" numeric(12, 4) NOT NULL,
	"threshold" numeric(12, 4) NOT NULL,
	"sample_size" integer DEFAULT 0 NOT NULL,
	"summary" varchar(500) NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"campaign_id" uuid,
	"ip_address" varchar(45),
	"status" "abuse_event_status" DEFAULT 'open' NOT NULL,
	"action_taken" "abuse_action" DEFAULT 'none' NOT NULL,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"resolution_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "abuse_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid,
	"name" varchar(100) NOT NULL,
	"description" text,
	"signal_type" "abuse_signal_type" NOT NULL,
	"threshold" numeric(12, 4) NOT NULL,
	"window_minutes" integer DEFAULT 60 NOT NULL,
	"min_sample_size" integer DEFAULT 100 NOT NULL,
	"severity" "abuse_severity" DEFAULT 'medium' NOT NULL,
	"action" "abuse_action" DEFAULT 'alert' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "abuse_sanctions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"event_id" uuid,
	"action" "abuse_action" NOT NULL,
	"reason" varchar(500) NOT NULL,
	"throttle_rate_per_hour" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"lifted_by" uuid,
	"lifted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spam_trap_hits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"trap_id" uuid NOT NULL,
	"campaign_id" uuid,
	"email_hash" varchar(64) NOT NULL,
	"hit_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spam_traps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email_hash" varchar(64) NOT NULL,
	"trap_type" varchar(20) NOT NULL,
	"source" varchar(50) DEFAULT 'internal' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "isp_fbl_registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"isp" "isp_provider" NOT NULL,
	"fbl_email" varchar(255),
	"webhook_url" varchar(2048),
	"notes" varchar(1024),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ecommerce_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"platform" "ecommerce_platform" NOT NULL,
	"name" varchar(255) NOT NULL,
	"status" "ecommerce_connection_status" DEFAULT 'pending' NOT NULL,
	"credentials" jsonb NOT NULL,
	"sync_state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"webhooks_enabled" boolean DEFAULT true NOT NULL,
	"oauth_state" varchar(256),
	"last_error_at" timestamp with time zone,
	"last_error_message" varchar(1024),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ecommerce_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"external_order_id" varchar(128) NOT NULL,
	"contact_id" uuid,
	"customer_email" varchar(255),
	"status" varchar(64),
	"total_amount" varchar(32),
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ordered_at" timestamp with time zone,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ecommerce_webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"topic" varchar(128) NOT NULL,
	"external_id" varchar(128),
	"processed" boolean DEFAULT false NOT NULL,
	"error" varchar(1024),
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "browse_abandonment_fires" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"sku" varchar(128),
	"fired_at" timestamp with time zone DEFAULT now() NOT NULL,
	"converted" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_page_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"contact_id" uuid,
	"visitor_token" varchar(128),
	"sku" varchar(128),
	"product_name" varchar(512),
	"product_url" varchar(2048),
	"view_count" integer DEFAULT 1 NOT NULL,
	"first_viewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_viewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inbound_emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"contact_id" uuid,
	"from_address" varchar(512) NOT NULL,
	"to_address" varchar(512) NOT NULL,
	"subject" varchar(1024),
	"text_body" text,
	"html_body" text,
	"message_id" varchar(512),
	"in_reply_to" varchar(512),
	"headers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sso_configurations" (
	"org_id" uuid PRIMARY KEY NOT NULL,
	"type" varchar(10) NOT NULL,
	"saml_entity_id" varchar(512),
	"saml_sso_url" varchar(1024),
	"saml_certificate" text,
	"oidc_issuer" varchar(512),
	"oidc_client_id" varchar(255),
	"oidc_client_secret" varchar(512),
	"oidc_authorize_url" varchar(1024),
	"oidc_token_url" varchar(1024),
	"oidc_jwks_uri" varchar(1024),
	"default_role" varchar(20) DEFAULT 'viewer' NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sso_login_states" (
	"state" varchar(64) PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"redirect_uri" varchar(1024) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "access_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"reviewer_user_id" uuid NOT NULL,
	"users_reviewed" integer DEFAULT 0 NOT NULL,
	"users_revoked" integer DEFAULT 0 NOT NULL,
	"findings" text,
	"report" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"reviewed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "compliance_controls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"control_id" varchar(50) NOT NULL,
	"category" varchar(50) NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"implemented" boolean DEFAULT false NOT NULL,
	"evidence_url" varchar(1024),
	"evidence_notes" text,
	"last_reviewed_at" timestamp with time zone,
	"next_review_at" timestamp with time zone,
	"owner_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_retention_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"resource" varchar(64) NOT NULL,
	"retention_days" integer NOT NULL,
	"last_enforced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid,
	"action" text NOT NULL,
	"resource" text NOT NULL,
	"resource_id" text,
	"changes" jsonb,
	"metadata" jsonb,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"plan" "plan" DEFAULT 'free' NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"stripe_status" text,
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"trial_ends_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_subscriptions_org_id_unique" UNIQUE("org_id"),
	CONSTRAINT "billing_subscriptions_stripe_customer_id_unique" UNIQUE("stripe_customer_id"),
	CONSTRAINT "billing_subscriptions_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id")
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"domain" text,
	"industry" text,
	"annual_revenue_usd" bigint,
	"employee_count" integer,
	"parent_account_id" uuid,
	"owner_user_id" uuid,
	"custom_fields" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "pipelines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"stages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deal_stage_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"deal_id" uuid NOT NULL,
	"from_stage_id" text,
	"to_stage_id" text NOT NULL,
	"duration_seconds" integer,
	"changed_by_user_id" uuid,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"pipeline_id" uuid NOT NULL,
	"stage_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"contact_id" uuid,
	"account_id" uuid,
	"value" numeric(18, 2) DEFAULT '0' NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"expected_close_date" timestamp with time zone,
	"actual_close_date" timestamp with time zone,
	"owner_user_id" uuid,
	"team_id" uuid,
	"status" "deal_status" DEFAULT 'open' NOT NULL,
	"lost_reason" text,
	"source" text,
	"custom_fields" jsonb,
	"stage_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "custom_object_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"key" varchar(64) NOT NULL,
	"singular_label" text NOT NULL,
	"plural_label" text NOT NULL,
	"description" text,
	"fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"primary_field_key" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_object_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"object_def_id" uuid NOT NULL,
	"object_key" varchar(64) NOT NULL,
	"external_id" varchar(255),
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "custom_object_relations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"record_id" uuid NOT NULL,
	"entity_type" varchar(32) NOT NULL,
	"entity_id" uuid NOT NULL,
	"entity_custom_key" varchar(64),
	"role" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "salesforce_connections" (
	"org_id" uuid PRIMARY KEY NOT NULL,
	"instance_url" text NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text,
	"token_issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"salesforce_user_id" text,
	"salesforce_org_id" text,
	"api_version" varchar(8) DEFAULT 'v59.0' NOT NULL,
	"sync_contacts" boolean DEFAULT true NOT NULL,
	"sync_accounts" boolean DEFAULT true NOT NULL,
	"sync_deals" boolean DEFAULT true NOT NULL,
	"field_map" jsonb,
	"last_sync_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "salesforce_id_map" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"entity_type" varchar(16) NOT NULL,
	"local_id" uuid NOT NULL,
	"salesforce_id" varchar(32) NOT NULL,
	"last_synced_hash" varchar(64),
	"last_synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "salesforce_sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"direction" varchar(8) NOT NULL,
	"entity_type" varchar(16) NOT NULL,
	"inserted" jsonb,
	"updated" jsonb,
	"failed" jsonb,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "raynet_company_map" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"raynet_company_id" bigint NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "raynet_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"instance_name" varchar(128) NOT NULL,
	"username" varchar(255) NOT NULL,
	"api_key" text NOT NULL,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sync_contacts" boolean DEFAULT true NOT NULL,
	"sync_companies" boolean DEFAULT true NOT NULL,
	"sync_deals" boolean DEFAULT true NOT NULL,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "raynet_contact_map" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"raynet_contact_id" bigint NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "raynet_deal_map" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"deal_id" uuid NOT NULL,
	"raynet_business_case_id" bigint NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_studio_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"app_id" uuid NOT NULL,
	"key" varchar(64) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"method" varchar(8) DEFAULT 'POST' NOT NULL,
	"url_template" varchar(2048) NOT NULL,
	"headers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"body_template" text,
	"param_schema" jsonb,
	"response_path" varchar(255),
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_studio_apps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"slug" varchar(64) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"icon_url" varchar(1024),
	"settings_schema" jsonb,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"access_token_hash" varchar(128),
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_studio_triggers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"app_id" uuid NOT NULL,
	"key" varchar(64) NOT NULL,
	"name" varchar(255) NOT NULL,
	"event_name" varchar(100) NOT NULL,
	"payload_schema" jsonb,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_studio_webhook_subscribers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"app_id" uuid NOT NULL,
	"event" varchar(100) NOT NULL,
	"target_url" varchar(2048) NOT NULL,
	"secret" varchar(128) NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"delivery_count" integer DEFAULT 0 NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"type" "crm_task_type" DEFAULT 'todo' NOT NULL,
	"status" "crm_task_status" DEFAULT 'open' NOT NULL,
	"priority" "crm_task_priority" DEFAULT 'medium' NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"contact_id" uuid,
	"deal_id" uuid,
	"account_id" uuid,
	"assigned_user_id" uuid,
	"created_by_user_id" uuid,
	"due_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "crm_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"body" text NOT NULL,
	"contact_id" uuid,
	"deal_id" uuid,
	"account_id" uuid,
	"author_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sales_sequences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"exit_on_reply" boolean DEFAULT true NOT NULL,
	"exit_on_unsubscribe" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sequence_enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"sequence_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"deal_id" uuid,
	"enrolled_by_user_id" uuid,
	"sender_email" varchar(255),
	"sender_name" varchar(255),
	"status" "sequence_enrollment_status" DEFAULT 'active' NOT NULL,
	"current_step_index" integer DEFAULT 0 NOT NULL,
	"next_step_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sequence_step_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"sequence_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"step_index" integer NOT NULL,
	"step_type" "sequence_step_type" NOT NULL,
	"executed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"result" jsonb
);
--> statement-breakpoint
CREATE TABLE "site_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"visitor_id" varchar(128) NOT NULL,
	"contact_id" uuid,
	"event_name" varchar(255) NOT NULL,
	"properties" jsonb DEFAULT '{}'::jsonb,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_page_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"visitor_id" varchar(128) NOT NULL,
	"contact_id" uuid,
	"url" text NOT NULL,
	"path" varchar(2048),
	"referrer" text,
	"title" text,
	"utm_source" varchar(255),
	"utm_medium" varchar(255),
	"utm_campaign" varchar(255),
	"utm_content" varchar(255),
	"session_id" varchar(128),
	"duration_seconds" integer,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tracked_sites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"site_token" varchar(64) NOT NULL,
	"domain" varchar(253) NOT NULL,
	"name" varchar(255),
	"tracking_enabled" boolean DEFAULT true NOT NULL,
	"cross_domain_sync" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tracked_sites_site_token_unique" UNIQUE("site_token")
);
--> statement-breakpoint
CREATE TABLE "site_message_impressions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"visitor_id" varchar(128) NOT NULL,
	"contact_id" uuid,
	"clicked" boolean DEFAULT false NOT NULL,
	"dismissed" boolean DEFAULT false NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"site_id" uuid,
	"name" varchar(255) NOT NULL,
	"type" "site_message_type" DEFAULT 'popup' NOT NULL,
	"trigger" "site_message_trigger" DEFAULT 'page_visit' NOT NULL,
	"conditions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"headline" varchar(255),
	"body" text,
	"cta_text" varchar(100),
	"cta_url" varchar(2048),
	"style" jsonb DEFAULT '{}'::jsonb,
	"show_once_per_visitor" boolean DEFAULT true NOT NULL,
	"show_once_per_session" boolean DEFAULT false NOT NULL,
	"delay_seconds" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "web_personalization_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"site_id" uuid,
	"name" varchar(255) NOT NULL,
	"selector" text NOT NULL,
	"action" "web_personalization_action" DEFAULT 'swap_text' NOT NULL,
	"value" text,
	"url_pattern" varchar(2048),
	"audience" jsonb DEFAULT '{"type":"all"}'::jsonb NOT NULL,
	"priority" varchar(10) DEFAULT '10' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "dmarc_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"report_id" varchar(255) NOT NULL,
	"reporter_org" varchar(255) NOT NULL,
	"domain" varchar(253) NOT NULL,
	"date_begin" timestamp with time zone NOT NULL,
	"date_end" timestamp with time zone NOT NULL,
	"policy" jsonb DEFAULT '{"domain":"","adkim":"r","aspf":"r","p":"none","pct":100}'::jsonb NOT NULL,
	"records" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"total_messages" integer DEFAULT 0 NOT NULL,
	"pass_count" integer DEFAULT 0 NOT NULL,
	"fail_count" integer DEFAULT 0 NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loyalty_programs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"tiers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"expiry_type" "loyalty_point_expiry_type" DEFAULT 'never' NOT NULL,
	"expiry_value" varchar(10),
	"earning_enabled" boolean DEFAULT true NOT NULL,
	"redemption_enabled" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "loyalty_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"program_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"status" "loyalty_member_status" DEFAULT 'active' NOT NULL,
	"current_tier_id" varchar(255),
	"point_balance" integer DEFAULT 0 NOT NULL,
	"lifetime_points" integer DEFAULT 0 NOT NULL,
	"enrolled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_activity_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loyalty_points" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"type" "loyalty_point_tx_type" NOT NULL,
	"points" integer NOT NULL,
	"balance_after" integer NOT NULL,
	"description" varchar(255),
	"source_ref" varchar(255),
	"actor_type" varchar(50) DEFAULT 'system' NOT NULL,
	"actor_id" varchar(255),
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loyalty_redemptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"reward_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"points_spent" integer NOT NULL,
	"fulfillment_code" varchar(255),
	"fulfilled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loyalty_rewards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"program_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"type" "loyalty_reward_type" NOT NULL,
	"point_cost" integer NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"required_tier_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"max_redemptions" integer,
	"max_per_member" integer,
	"redemption_count" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "loyalty_earning_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"program_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"event_type" "loyalty_earning_event" NOT NULL,
	"custom_event_name" varchar(255),
	"points_fixed" integer,
	"points_per_currency" numeric(10, 4),
	"currency_field" varchar(100),
	"max_points_per_event" integer,
	"max_lifetime_points" integer,
	"max_points_per_period" integer,
	"period_days" integer,
	"conditions" jsonb,
	"active" boolean DEFAULT true NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_associate_agreements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"ba_name" varchar(255) NOT NULL,
	"ba_email" varchar(255),
	"ba_type" varchar(100),
	"status" "baa_status" DEFAULT 'pending' NOT NULL,
	"effective_date" timestamp with time zone,
	"expiration_date" timestamp with time zone,
	"document_url" varchar(1024),
	"signed_by_user_id" uuid,
	"signed_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hipaa_access_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid,
	"action" varchar(100) NOT NULL,
	"resource" varchar(100) NOT NULL,
	"resource_id" varchar(255),
	"phi_field_keys" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ip_address" varchar(45),
	"user_agent" varchar(512),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "phi_field_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"field_key" varchar(255) NOT NULL,
	"phi_category" varchar(100) DEFAULT 'other' NOT NULL,
	"encrypt_at_rest" boolean DEFAULT false NOT NULL,
	"redact_in_logs" boolean DEFAULT true NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_presence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" varchar(32) DEFAULT 'offline' NOT NULL,
	"last_active_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_hours" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"timezone" varchar(64) DEFAULT 'UTC' NOT NULL,
	"schedule" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"holidays" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"after_hours_target" varchar(32) DEFAULT 'voicemail' NOT NULL,
	"after_hours_target_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hunt_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"strategy" varchar(32) DEFAULT 'ring-all' NOT NULL,
	"member_user_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ring_timeout_seconds" integer DEFAULT 30 NOT NULL,
	"overflow_target" varchar(32) DEFAULT 'voicemail' NOT NULL,
	"overflow_target_id" uuid,
	"rr_index" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ivr_menus" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"greeting" varchar(2000) NOT NULL,
	"did_number" varchar(64),
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"timeout_seconds" integer DEFAULT 10 NOT NULL,
	"invalid_target" varchar(32) DEFAULT 'repeat' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"host_user_id" uuid NOT NULL,
	"invitee_email" varchar(255) NOT NULL,
	"invitee_name" varchar(255),
	"title" varchar(1024) NOT NULL,
	"description" text,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"timezone" varchar(64),
	"location" varchar(512),
	"meeting_url" varchar(1024),
	"status" varchar(32) DEFAULT 'confirmed' NOT NULL,
	"external_event_id" varchar(255),
	"integration_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calendar_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"integration_id" uuid NOT NULL,
	"external_event_id" varchar(255) NOT NULL,
	"calendar_id" varchar(255),
	"title" varchar(1024),
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"all_day" boolean DEFAULT false NOT NULL,
	"status" varchar(32) DEFAULT 'confirmed' NOT NULL,
	"busy" boolean DEFAULT true NOT NULL,
	"attendees" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"internal_booking_id" uuid,
	"raw_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calendar_integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" varchar(32) NOT NULL,
	"external_account_id" varchar(255) NOT NULL,
	"external_account_email" varchar(255),
	"access_token" text NOT NULL,
	"refresh_token" text,
	"token_expires_at" timestamp with time zone,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"primary_calendar_id" varchar(255),
	"sync_token" text,
	"last_synced_at" timestamp with time zone,
	"caldav_url" varchar(512),
	"caldav_username" varchar(255),
	"status" varchar(32) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity_merges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"winner_contact_id" uuid NOT NULL,
	"loser_contact_id" uuid NOT NULL,
	"moved_signals" integer DEFAULT 0 NOT NULL,
	"reason" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity_signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"signal_type" varchar(32) NOT NULL,
	"signal_value" varchar(512) NOT NULL,
	"confidence" integer DEFAULT 50 NOT NULL,
	"source" varchar(64),
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activation_destinations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"kind" varchar(32) NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"destination_id" uuid NOT NULL,
	"segment_id" uuid,
	"mode" varchar(16) DEFAULT 'upsert' NOT NULL,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"rows_processed" varchar(32) DEFAULT '0' NOT NULL,
	"rows_succeeded" varchar(32) DEFAULT '0' NOT NULL,
	"rows_failed" varchar(32) DEFAULT '0' NOT NULL,
	"error" varchar(2000),
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "cdp_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"event_id" varchar(128),
	"contact_id" uuid,
	"anonymous_id" varchar(128),
	"event_type" varchar(64) NOT NULL,
	"name" varchar(255) NOT NULL,
	"source" varchar(64),
	"properties" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_traits" (
	"contact_id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"values" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"version" varchar(32) DEFAULT '0' NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hubspot_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"hub_id" varchar(64),
	"hub_domain" varchar(255),
	"access_token" text NOT NULL,
	"refresh_token" text,
	"token_expires_at" timestamp with time zone,
	"portal_id" varchar(64),
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sync_contacts" boolean DEFAULT true NOT NULL,
	"sync_deals" boolean DEFAULT true NOT NULL,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hubspot_contact_map" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"hubspot_vid" bigint NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hubspot_deal_map" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"deal_id" uuid NOT NULL,
	"hubspot_deal_id" bigint NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calendly_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_uri" varchar(512),
	"organization_uri" varchar(512),
	"access_token" text NOT NULL,
	"refresh_token" text,
	"token_expires_at" timestamp with time zone,
	"webhook_signing_key" text,
	"create_deal" boolean DEFAULT false NOT NULL,
	"workflow_trigger" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_availability" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" varchar(32) DEFAULT 'offline' NOT NULL,
	"max_concurrent" integer DEFAULT 5 NOT NULL,
	"active_count" integer DEFAULT 0 NOT NULL,
	"skills" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"channels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_active_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_routing_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"channel" varchar(64),
	"strategy" varchar(32) DEFAULT 'round-robin' NOT NULL,
	"required_skill" varchar(128),
	"agent_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"priority" integer DEFAULT 5 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"ticket_id" uuid NOT NULL,
	"assigned_to" uuid,
	"assigned_by" uuid,
	"reason" varchar(64) DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "phone_number_port_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"numbers" jsonb NOT NULL,
	"losing_carrier" varchar(255),
	"account_number" varchar(255),
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"target_date" timestamp with time zone,
	"notes" varchar(2000),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "phone_numbers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"number" varchar(32) NOT NULL,
	"provider" varchar(32) DEFAULT 'twilio' NOT NULL,
	"provider_sid" varchar(255),
	"status" varchar(32) DEFAULT 'active' NOT NULL,
	"capabilities" jsonb DEFAULT '["voice","sms"]'::jsonb NOT NULL,
	"country_code" varchar(2) DEFAULT 'US' NOT NULL,
	"label" varchar(255),
	"assigned_user_id" uuid,
	"routing_target_type" varchar(32),
	"routing_target_id" uuid,
	"record_calls" boolean DEFAULT false NOT NULL,
	"monthly_rate_usd" varchar(16),
	"provisioned_at" timestamp with time zone,
	"released_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_availability" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"schedule" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"timezone" varchar(64) DEFAULT 'UTC' NOT NULL,
	"date_overrides" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"slug" varchar(128) NOT NULL,
	"display_name" varchar(255) NOT NULL,
	"bio" text,
	"avatar_url" varchar(1024),
	"timezone" varchar(64) DEFAULT 'UTC' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"slug" varchar(128) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"duration_minutes" integer DEFAULT 30 NOT NULL,
	"buffer_before_minutes" integer DEFAULT 0 NOT NULL,
	"buffer_after_minutes" integer DEFAULT 0 NOT NULL,
	"min_notice_minutes" integer DEFAULT 60 NOT NULL,
	"max_per_day" integer DEFAULT 0 NOT NULL,
	"booking_window_days" integer DEFAULT 60 NOT NULL,
	"location_type" varchar(32) DEFAULT 'google_meet' NOT NULL,
	"location_value" varchar(512),
	"timezone" varchar(64) DEFAULT 'UTC' NOT NULL,
	"questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"team_member_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"scheduling_type" varchar(32) DEFAULT 'single' NOT NULL,
	"color" varchar(16),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "round_robin_state" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"event_type_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"assignment_count" integer DEFAULT 0 NOT NULL,
	"last_assigned_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cdp_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"kind" varchar(64) NOT NULL,
	"direction" varchar(8) DEFAULT 'pull' NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"sync_cron" varchar(64) DEFAULT '0 * * * *' NOT NULL,
	"last_cursor" text,
	"last_sync_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cdp_sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"rows_pulled" integer DEFAULT 0 NOT NULL,
	"rows_upserted" integer DEFAULT 0 NOT NULL,
	"rows_skipped" integer DEFAULT 0 NOT NULL,
	"rows_failed" integer DEFAULT 0 NOT NULL,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "organization_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid,
	"email" varchar(255) NOT NULL,
	"role" varchar(32) DEFAULT 'viewer' NOT NULL,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"invited_by_user_id" uuid,
	"invitation_token" text,
	"invitation_expires_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_balances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"balance_cents" numeric(14, 0) DEFAULT '0' NOT NULL,
	"total_purchased_cents" numeric(14, 0) DEFAULT '0' NOT NULL,
	"total_consumed_cents" numeric(14, 0) DEFAULT '0' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"type" varchar(16) NOT NULL,
	"amount_cents" numeric(14, 0) NOT NULL,
	"balance_after_cents" numeric(14, 0) NOT NULL,
	"reference_id" varchar(255),
	"reference_type" varchar(64),
	"product" varchar(32),
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_meter_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"product" varchar(32) NOT NULL,
	"units" integer DEFAULT 1 NOT NULL,
	"reference_id" varchar(255),
	"reference_type" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_usage_meters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"product" varchar(32) NOT NULL,
	"period" varchar(7) NOT NULL,
	"units_used" integer DEFAULT 0 NOT NULL,
	"billed_usd" numeric(10, 4),
	"included_units" integer DEFAULT 0 NOT NULL,
	"overage_rate_usd" numeric(10, 6) DEFAULT '0' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seo_audit_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"url" text NOT NULL,
	"title" text,
	"meta_desc" text,
	"h1" text,
	"word_count" integer,
	"readability" text,
	"score" integer,
	"issues" jsonb DEFAULT '[]'::jsonb,
	"headings" jsonb DEFAULT '{}'::jsonb,
	"internal_links" jsonb DEFAULT '[]'::jsonb,
	"images" jsonb DEFAULT '[]'::jsonb,
	"raw_data" jsonb DEFAULT '{}'::jsonb,
	"audited_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seo_cluster_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"cluster_id" uuid NOT NULL,
	"page_type" varchar(16) DEFAULT 'spoke' NOT NULL,
	"title" varchar(500) NOT NULL,
	"url" text,
	"target_keyword" varchar(255),
	"status" varchar(32) DEFAULT 'idea' NOT NULL,
	"word_count" integer,
	"notes" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seo_keywords" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"keyword" varchar(500) NOT NULL,
	"language" varchar(8) DEFAULT 'en' NOT NULL,
	"country" varchar(4) DEFAULT 'US' NOT NULL,
	"search_volume" integer,
	"difficulty" integer,
	"cpc" text,
	"intent" varchar(32),
	"enriched_at" timestamp with time zone,
	"raw_data" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seo_rank_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"tracking_id" uuid NOT NULL,
	"date" varchar(10) NOT NULL,
	"position" integer,
	"url" text,
	"title" text,
	"raw_data" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seo_rank_tracking" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"keyword" varchar(500) NOT NULL,
	"url" text NOT NULL,
	"language" varchar(8) DEFAULT 'en' NOT NULL,
	"country" varchar(4) DEFAULT 'US' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seo_topic_clusters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"status" varchar(32) DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"platform" varchar(32) NOT NULL,
	"platform_user_id" varchar(255) NOT NULL,
	"platform_username" varchar(255),
	"display_name" varchar(255),
	"avatar_url" text,
	"access_token" text NOT NULL,
	"refresh_token" text,
	"token_expires_at" timestamp with time zone,
	"scopes" text,
	"active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_oauth_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"platform" varchar(32) NOT NULL,
	"state" varchar(128) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_analytics_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"date" varchar(10) NOT NULL,
	"followers" integer DEFAULT 0 NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"reach" integer DEFAULT 0 NOT NULL,
	"engagements" integer DEFAULT 0 NOT NULL,
	"raw_data" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_mentions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"platform" varchar(32) NOT NULL,
	"platform_mention_id" varchar(255) NOT NULL,
	"type" varchar(32) DEFAULT 'mention' NOT NULL,
	"author_username" varchar(255),
	"author_id" varchar(255),
	"body" text,
	"url" text,
	"sentiment" varchar(16),
	"matched_keyword" varchar(255),
	"status" varchar(32) DEFAULT 'new' NOT NULL,
	"raw_data" jsonb DEFAULT '{}'::jsonb,
	"mentioned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_monitoring_keywords" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"keyword" varchar(255) NOT NULL,
	"platforms" jsonb DEFAULT '[]'::jsonb,
	"active" varchar(8) DEFAULT 'true' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"caption" text,
	"media_urls" jsonb DEFAULT '[]'::jsonb,
	"link_url" text,
	"hashtags" jsonb DEFAULT '[]'::jsonb,
	"account_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" varchar(32) DEFAULT 'draft' NOT NULL,
	"scheduled_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"results" jsonb DEFAULT '[]'::jsonb,
	"impressions" integer DEFAULT 0 NOT NULL,
	"engagements" integer DEFAULT 0 NOT NULL,
	"likes" integer DEFAULT 0 NOT NULL,
	"comments" integer DEFAULT 0 NOT NULL,
	"shares" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ad_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"platform" varchar(32) NOT NULL,
	"platform_account_id" varchar(255) NOT NULL,
	"account_name" varchar(255),
	"access_token" text NOT NULL,
	"refresh_token" text,
	"token_expires_at" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ad_audience_syncs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"ad_account_id" uuid NOT NULL,
	"segment_id" uuid,
	"list_id" uuid,
	"audience_name" varchar(255) NOT NULL,
	"platform_audience_id" varchar(255),
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"contacts_uploaded" jsonb DEFAULT '0'::jsonb,
	"last_sync_at" timestamp with time zone,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ad_performance_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"ad_account_id" uuid NOT NULL,
	"date" varchar(10) NOT NULL,
	"platform" varchar(32) NOT NULL,
	"campaign_id" varchar(255),
	"campaign_name" varchar(255),
	"ad_set_id" varchar(255),
	"impressions" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"spend" numeric(14, 4) DEFAULT '0' NOT NULL,
	"conversions" integer DEFAULT 0 NOT NULL,
	"revenue" numeric(14, 2) DEFAULT '0' NOT NULL,
	"raw_data" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"deal_id" uuid,
	"contact_id" uuid,
	"quote_number" varchar(64) NOT NULL,
	"title" varchar(255) NOT NULL,
	"status" varchar(32) DEFAULT 'draft' NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"line_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"subtotal" numeric(18, 2) DEFAULT '0' NOT NULL,
	"discount_total" numeric(18, 2) DEFAULT '0' NOT NULL,
	"tax_total" numeric(18, 2) DEFAULT '0' NOT NULL,
	"total" numeric(18, 2) DEFAULT '0' NOT NULL,
	"valid_until" timestamp with time zone,
	"notes" text,
	"terms" text,
	"signature_token" varchar(128),
	"signed_at" timestamp with time zone,
	"signed_by_name" varchar(255),
	"signed_by_ip" varchar(64),
	"esign_provider" varchar(32),
	"esign_envelope_id" varchar(255),
	"esign_status" varchar(32),
	"pdf_url" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"sent_at" timestamp with time zone,
	"viewed_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"deal_id" uuid,
	"contact_id" uuid,
	"invoice_number" varchar(64) NOT NULL,
	"status" varchar(32) DEFAULT 'draft' NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"line_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"subtotal" numeric(18, 2) DEFAULT '0' NOT NULL,
	"tax_total" numeric(18, 2) DEFAULT '0' NOT NULL,
	"total" numeric(18, 2) DEFAULT '0' NOT NULL,
	"amount_paid" numeric(18, 2) DEFAULT '0' NOT NULL,
	"amount_due" numeric(18, 2) DEFAULT '0' NOT NULL,
	"due_date" timestamp with time zone,
	"notes" text,
	"stripe_payment_intent_id" varchar(255),
	"stripe_invoice_id" varchar(255),
	"paid_at" timestamp with time zone,
	"pdf_url" text,
	"reminders_sent" integer DEFAULT 0 NOT NULL,
	"last_reminder_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"sent_at" timestamp with time zone,
	"voided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"subscription_id" uuid NOT NULL,
	"change_type" varchar(32) NOT NULL,
	"previous_line_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"new_line_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"previous_mrr" numeric(18, 2) DEFAULT '0' NOT NULL,
	"new_mrr" numeric(18, 2) DEFAULT '0' NOT NULL,
	"proration_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"proration_invoice_id" uuid,
	"effective_at" timestamp with time zone DEFAULT now() NOT NULL,
	"changed_by_user_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"contact_id" uuid,
	"deal_id" uuid,
	"subscription_number" varchar(64) NOT NULL,
	"status" varchar(32) DEFAULT 'active' NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"line_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"mrr" numeric(18, 2) DEFAULT '0' NOT NULL,
	"billing_interval" varchar(16) DEFAULT 'month' NOT NULL,
	"billing_interval_count" integer DEFAULT 1 NOT NULL,
	"billing_anchor" integer,
	"start_date" timestamp with time zone DEFAULT now() NOT NULL,
	"trial_ends_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"current_period_start" timestamp with time zone DEFAULT now() NOT NULL,
	"current_period_end" timestamp with time zone NOT NULL,
	"next_invoice_at" timestamp with time zone NOT NULL,
	"cancel_at" timestamp with time zone,
	"canceled_at" timestamp with time zone,
	"cancel_reason" text,
	"past_due_since" timestamp with time zone,
	"dunning_attempts" integer DEFAULT 0 NOT NULL,
	"stripe_subscription_id" varchar(255),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "lifecycle_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"from_stage" varchar(64),
	"to_stage" varchar(64) NOT NULL,
	"conditions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"add_tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"trigger_workflow_id" uuid,
	"evaluation_count" integer DEFAULT 0 NOT NULL,
	"match_count" integer DEFAULT 0 NOT NULL,
	"last_matched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "associations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"from_type" varchar(32) NOT NULL,
	"from_id" uuid NOT NULL,
	"to_type" varchar(32) NOT NULL,
	"to_id" uuid NOT NULL,
	"label" varchar(64),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "video_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"contact_id" uuid,
	"title" varchar(255),
	"share_token" varchar(64) NOT NULL,
	"original_object_key" text NOT NULL,
	"hls_manifest_key" text,
	"thumbnail_key" text,
	"duration_seconds" integer,
	"size_bytes" integer,
	"mime_type" varchar(64),
	"status" varchar(32) DEFAULT 'pending_upload' NOT NULL,
	"transcode_error" text,
	"play_count" integer DEFAULT 0 NOT NULL,
	"completion_count" integer DEFAULT 0 NOT NULL,
	"last_played_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "video_messages_share_token_unique" UNIQUE("share_token")
);
--> statement-breakpoint
CREATE TABLE "video_play_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"video_id" uuid NOT NULL,
	"event_type" varchar(16) NOT NULL,
	"position_seconds" integer DEFAULT 0 NOT NULL,
	"ip_address" varchar(64),
	"user_agent" text,
	"referer" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kb_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"chunk_index" integer NOT NULL,
	"chunk_text" text NOT NULL,
	"token_count" integer DEFAULT 0 NOT NULL,
	"embedding" vector(1024),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kb_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"source_type" varchar(32) NOT NULL,
	"source_id" varchar(255),
	"external_ref" varchar(1024),
	"title" text NOT NULL,
	"url" text,
	"language" varchar(8) DEFAULT 'en' NOT NULL,
	"body" text NOT NULL,
	"content_hash" varchar(64) NOT NULL,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"error" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org_sandboxes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"sandbox_org_id" uuid NOT NULL,
	"name" varchar(128) NOT NULL,
	"purpose" varchar(32) DEFAULT 'dev' NOT NULL,
	"status" varchar(16) DEFAULT 'provisioning' NOT NULL,
	"seed_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"no_op_mode" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "team_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"team_role" varchar(32) DEFAULT 'member' NOT NULL,
	"cross_team_access" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" varchar(128) NOT NULL,
	"slug" varchar(128) NOT NULL,
	"description" text,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "field_permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"role" varchar(64) NOT NULL,
	"entity" varchar(64) NOT NULL,
	"readable" jsonb DEFAULT '["*"]'::jsonb NOT NULL,
	"hidden" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"writable" jsonb DEFAULT '["*"]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"slug" varchar(64) NOT NULL,
	"name" varchar(128) NOT NULL,
	"description" text,
	"outbound_url" varchar(1024) NOT NULL,
	"shared_secret" varchar(128) NOT NULL,
	"message_schema" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"rate_limits" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "calculated_properties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"entity" "calc_prop_entity" NOT NULL,
	"key" varchar(64) NOT NULL,
	"label" varchar(128) NOT NULL,
	"description" text,
	"result_type" "calc_prop_result_type" NOT NULL,
	"formula" jsonb NOT NULL,
	"cache_strategy" varchar(16) DEFAULT 'lazy' NOT NULL,
	"cache_ttl_seconds" integer DEFAULT 3600 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "calculated_property_values" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"prop_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"value" jsonb,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "data_sync_conflicts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"pair_id" uuid NOT NULL,
	"field" varchar(128) NOT NULL,
	"local_value" jsonb,
	"remote_value" jsonb,
	"resolved" boolean DEFAULT false NOT NULL,
	"resolution" varchar(32),
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "data_sync_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"provider" "crm_sync_provider" NOT NULL,
	"entity" "crm_sync_entity" NOT NULL,
	"direction" "crm_sync_direction" DEFAULT 'both' NOT NULL,
	"field_map" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"pull_filter" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_full_sync_at" timestamp with time zone,
	"last_incremental_sync_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_sync_pairs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"provider" "crm_sync_provider" NOT NULL,
	"entity" "crm_sync_entity" NOT NULL,
	"local_id" uuid NOT NULL,
	"remote_id" varchar(128) NOT NULL,
	"remote_hash" varchar(64),
	"last_synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_pipeline_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pipeline_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"input_count" varchar(16),
	"output_count" varchar(16),
	"error_message" text,
	"preview" jsonb,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_pipelines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" varchar(128) NOT NULL,
	"description" text,
	"source" "data_pipeline_source" NOT NULL,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"trigger" "data_pipeline_trigger" DEFAULT 'manual' NOT NULL,
	"schedule" varchar(64),
	"status" "data_pipeline_status" DEFAULT 'draft' NOT NULL,
	"sink_webhook_url" varchar(1024),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "contact_gdpr_consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"purpose_id" uuid NOT NULL,
	"granted" boolean NOT NULL,
	"source" varchar(64) NOT NULL,
	"consent_text" text,
	"ip_address" varchar(45),
	"user_agent" varchar(1024),
	"granted_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revoke_reason" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "processing_purposes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"slug" varchar(80) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"legal_basis" varchar(30) DEFAULT 'consent' NOT NULL,
	"retention_days" integer,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "processing_purposes_org_slug_uq" UNIQUE("org_id","slug")
);
--> statement-breakpoint
CREATE TABLE "wheel_spins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"form_id" uuid NOT NULL,
	"contact_id" uuid,
	"email" varchar(320) NOT NULL,
	"prize_index" integer NOT NULL,
	"prize_label" varchar(255) NOT NULL,
	"coupon_code" varchar(128),
	"confirmed" boolean DEFAULT false NOT NULL,
	"ip_address" varchar(45),
	"spun_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inbox_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"contact_id" uuid,
	"channel" varchar(30) NOT NULL,
	"thread_id" varchar(255) NOT NULL,
	"provider_message_id" varchar(255) NOT NULL,
	"sender_id" varchar(255) NOT NULL,
	"sender_name" varchar(255),
	"content" text DEFAULT '' NOT NULL,
	"attachments" jsonb DEFAULT '[]'::jsonb,
	"is_outbound" boolean DEFAULT false NOT NULL,
	"replied" boolean DEFAULT false NOT NULL,
	"assigned_agent_id" uuid,
	"sent_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"raw_payload" jsonb
);
--> statement-breakpoint
CREATE TABLE "meta_page_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"page_id" varchar(64) NOT NULL,
	"channel" varchar(20) NOT NULL,
	"page_name" varchar(255),
	"access_token" varchar(512),
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meta_page_mappings_page_id_channel_uniq" UNIQUE("page_id","channel")
);
--> statement-breakpoint
CREATE TABLE "social_contact_identifiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"platform" varchar(32) NOT NULL,
	"external_id" varchar(255) NOT NULL,
	"display_name" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "social_contact_identifiers_platform_external_uniq" UNIQUE("org_id","platform","external_id")
);
--> statement-breakpoint
CREATE TABLE "digital_asset_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"contact_id" uuid,
	"token_hash" varchar(64) NOT NULL,
	"license_key_id" uuid,
	"download_count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"first_download_at" timestamp with time zone,
	"last_download_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "digital_asset_deliveries_token_hash_uniq" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "digital_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" varchar(1000),
	"storage_key" varchar(1024),
	"external_url" varchar(2048),
	"content_type" varchar(100),
	"file_size_bytes" integer,
	"max_downloads" integer,
	"url_expiry_seconds" integer DEFAULT 3600,
	"requires_license_key" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "license_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"contact_id" uuid,
	"key" varchar(255) NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"max_activations" integer,
	"activation_count" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"expires_at" timestamp with time zone,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "license_keys_key_uniq" UNIQUE("org_id","key")
);
--> statement-breakpoint
CREATE TABLE "canned_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"shortcut" varchar(80),
	"category" varchar(80),
	"body" text NOT NULL,
	"shared" boolean DEFAULT true NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "external_feeds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"feed_url" text NOT NULL,
	"format" varchar(20) DEFAULT 'json' NOT NULL,
	"mapping" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"schedule" varchar(20) DEFAULT 'daily' NOT NULL,
	"action" varchar(30) DEFAULT 'upsert_contact' NOT NULL,
	"event_name" varchar(100),
	"active" boolean DEFAULT true NOT NULL,
	"http_headers" jsonb DEFAULT '{}'::jsonb,
	"last_fetched_at" timestamp with time zone,
	"last_item_count" integer DEFAULT 0,
	"last_error" text,
	"next_run_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ab_test_holdbacks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ab_test_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"winner_variant_id" varchar(100) NOT NULL,
	"winner_metric" varchar(50) DEFAULT 'open_rate' NOT NULL,
	"winner_score" numeric(10, 6) DEFAULT '0' NOT NULL,
	"runner_up_score" numeric(10, 6) DEFAULT '0' NOT NULL,
	"confidence_pct" numeric(5, 2),
	"holdback_count" integer DEFAULT 0 NOT NULL,
	"auto_send_dispatched" boolean DEFAULT false NOT NULL,
	"dispatched_at" timestamp with time zone,
	"selected_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "newsletter_subscriptions" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"org_id" varchar(36) NOT NULL,
	"contact_id" varchar(36) NOT NULL,
	"tier_id" varchar(36) NOT NULL,
	"status" "newsletter_subscription_status" DEFAULT 'active' NOT NULL,
	"stripe_subscription_id" varchar(100),
	"stripe_customer_id" varchar(100),
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"canceled_at" timestamp with time zone,
	"trial_end" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "newsletter_tiers" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"org_id" varchar(36) NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"price_amount" integer DEFAULT 0 NOT NULL,
	"currency" varchar(3) DEFAULT 'CZK' NOT NULL,
	"billing_interval" varchar(20) DEFAULT 'month' NOT NULL,
	"stripe_price_id" varchar(100),
	"benefits_markdown" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "newsletter_referral_events" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"referral_id" varchar(36) NOT NULL,
	"org_id" varchar(36) NOT NULL,
	"event_type" varchar(30) NOT NULL,
	"referred_email" varchar(255),
	"referred_contact_id" varchar(36),
	"ip" varchar(45),
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "newsletter_referral_programs" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"org_id" varchar(36) NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"conversions_per_reward" integer DEFAULT 1 NOT NULL,
	"reward_type" "referral_reward_type" DEFAULT 'none' NOT NULL,
	"reward_value" varchar(255),
	"workflow_id" varchar(36),
	"is_active" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "newsletter_referrals" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"org_id" varchar(36) NOT NULL,
	"program_id" varchar(36) NOT NULL,
	"referrer_contact_id" varchar(36) NOT NULL,
	"code" varchar(20) NOT NULL,
	"click_count" integer DEFAULT 0 NOT NULL,
	"conversion_count" integer DEFAULT 0 NOT NULL,
	"rewards_issued" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bimi_configs" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"org_id" varchar(36) NOT NULL,
	"domain" varchar(255) NOT NULL,
	"svg_logo_url" text NOT NULL,
	"vmc_url" text,
	"dns_record_value" text NOT NULL,
	"is_verified" boolean DEFAULT false NOT NULL,
	"verified_at" timestamp with time zone,
	"last_check_at" timestamp with time zone,
	"last_check_result" varchar(50),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "playbook_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"playbook_id" uuid NOT NULL,
	"entity_type" varchar(32) NOT NULL,
	"contact_id" uuid,
	"deal_id" uuid,
	"assigned_user_id" uuid,
	"status" "playbook_run_status" DEFAULT 'in_progress' NOT NULL,
	"step_logs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"current_step_index" varchar(8) DEFAULT '0' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "playbooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"entity_types" jsonb DEFAULT '["deal"]'::jsonb NOT NULL,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rotation_assignment_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"config_id" uuid NOT NULL,
	"entity_type" varchar(32) NOT NULL,
	"entity_id" uuid NOT NULL,
	"assigned_user_id" uuid NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rotation_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"entity_type" "rotation_entity_type" NOT NULL,
	"pipeline_id" uuid,
	"strategy" "rotation_strategy" DEFAULT 'round_robin' NOT NULL,
	"user_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"last_assigned_index" integer DEFAULT -1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quote_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"default_line_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"default_currency" varchar(3) DEFAULT 'CZK' NOT NULL,
	"default_notes" text,
	"default_terms" text,
	"pdf_html_template" text,
	"pdf_css" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intent_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"contact_id" uuid,
	"account_domain" varchar(255),
	"score" integer DEFAULT 0 NOT NULL,
	"breakdown" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intent_signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"contact_id" uuid,
	"account_domain" varchar(255),
	"signal_type" "intent_signal_type" NOT NULL,
	"source" "intent_signal_source" DEFAULT 'first_party' NOT NULL,
	"score" integer DEFAULT 50 NOT NULL,
	"source_url" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_extension_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"app_id" uuid NOT NULL,
	"key" varchar(64) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"icon_url" varchar(2048),
	"entity_types" jsonb DEFAULT '["contact"]'::jsonb NOT NULL,
	"position" varchar(32) DEFAULT 'sidebar' NOT NULL,
	"data_url" varchar(2048) NOT NULL,
	"action_url" varchar(2048),
	"iframe_sandbox" boolean DEFAULT true NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brand_voice_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"profile" jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"samples_used" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nba_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"recommended_channel" text NOT NULL,
	"score" numeric(5, 2) NOT NULL,
	"breakdown" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"best_send_hour" numeric(3, 0),
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "newsletter_ad_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"placement_type" "ad_placement_type" DEFAULT 'banner' NOT NULL,
	"price_eur" numeric(10, 2) NOT NULL,
	"estimated_reach" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "newsletter_ads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"slot_id" uuid NOT NULL,
	"advertiser_name" text NOT NULL,
	"advertiser_email" text NOT NULL,
	"status" "ad_status" DEFAULT 'pending' NOT NULL,
	"headline" text NOT NULL,
	"body_text" text NOT NULL,
	"image_url" text,
	"cta_text" text DEFAULT 'Learn more' NOT NULL,
	"cta_url" text NOT NULL,
	"campaign_id" uuid,
	"paid_eur" numeric(10, 2),
	"impressions" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"targeting" jsonb DEFAULT '{}'::jsonb,
	"scheduled_for" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_personas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"persona" "persona_type" NOT NULL,
	"confidence" numeric(4, 3) DEFAULT '0.5' NOT NULL,
	"signals" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ai_reasoning" text,
	"overridden_by" uuid,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "zp_collection_forms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"embed_token" text NOT NULL,
	"submission_count" text DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "zp_contact_data" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"data_type" "zp_data_type" NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"source" text DEFAULT 'form' NOT NULL,
	"form_id" uuid,
	"collected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consent_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"event_type" "consent_event_type" NOT NULL,
	"legal_basis" "consent_legal_basis" DEFAULT 'consent' NOT NULL,
	"channel" text,
	"purpose_code" text,
	"consent_version" text,
	"ip_hash" text,
	"user_agent" text,
	"source" text DEFAULT 'form' NOT NULL,
	"source_url" text,
	"proof_payload" jsonb,
	"operator_id" uuid,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "co_marketing_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"initiator_org_id" uuid NOT NULL,
	"partner_org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" "co_marketing_status" DEFAULT 'draft' NOT NULL,
	"template_html" text,
	"initiator_list_id" uuid,
	"partner_list_id" uuid,
	"initiator_cost_share" numeric(5, 2) DEFAULT '50' NOT NULL,
	"partner_cost_share" numeric(5, 2) DEFAULT '50' NOT NULL,
	"scheduled_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"combined_metrics" jsonb,
	"invite_token" text,
	"invite_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dynamic_content_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"placeholder_tag" text NOT NULL,
	"variants" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"fallback_html" text NOT NULL,
	"data_source_url" text,
	"data_source_headers" jsonb,
	"cache_ttl_seconds" integer DEFAULT 300 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "competitor_emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"watchlist_id" uuid NOT NULL,
	"subject_line" text NOT NULL,
	"from_name" text,
	"from_email" text,
	"body_html" text,
	"preheader" text,
	"analysis" jsonb,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "competitor_watchlist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"competitor_name" text NOT NULL,
	"competitor_domain" text NOT NULL,
	"monitor_email" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"total_emails_received" integer DEFAULT 0 NOT NULL,
	"last_email_received_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "newsletter_paid_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"tier" "paywall_tier" NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"stripe_subscription_id" text,
	"current_period_end" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "newsletter_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"tier" "paywall_tier" NOT NULL,
	"price_czk_monthly" numeric(8, 2),
	"price_eur_monthly" numeric(8, 2),
	"stripe_price_id" text,
	"features" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"subscriber_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brand_guidelines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text DEFAULT 'Default' NOT NULL,
	"guidelines" jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inbox_placement_tests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"campaign_id" uuid,
	"subject" text NOT NULL,
	"from_email" text NOT NULL,
	"overall_score" integer NOT NULL,
	"results" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"issues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"recommendations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tested_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "packeta_shipments" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"contact_id" text,
	"order_id" text,
	"barcode" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"tracking_url" text,
	"recipient_name" text,
	"recipient_email" text,
	"recipient_phone" text,
	"pickup_point_id" text,
	"weight" text,
	"cod" text,
	"currency" text DEFAULT 'CZK',
	"raw_status" jsonb,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cz_payment_gateway_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"gopay_client_id" text,
	"gopay_client_secret" text,
	"gopay_go_id" text,
	"gopay_test_mode" text DEFAULT 'false',
	"comgate_merchant" text,
	"comgate_secret" text,
	"comgate_test_mode" text DEFAULT 'false',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cz_payment_gateway_settings_org_id_unique" UNIQUE("org_id")
);
--> statement-breakpoint
CREATE TABLE "cz_payment_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"contact_id" text,
	"gateway" text NOT NULL,
	"gateway_id" text NOT NULL,
	"amount" text NOT NULL,
	"currency" text DEFAULT 'CZK' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"return_url" text,
	"notify_url" text,
	"description" text,
	"raw_data" jsonb,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "erp_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"pohoda_url" text,
	"pohoda_username" text,
	"pohoda_password" text,
	"pohoda_ico" text,
	"flexibee_url" text,
	"flexibee_username" text,
	"flexibee_password" text,
	"flexibee_company" text,
	"last_sync_at" timestamp with time zone,
	"synced_contacts" integer DEFAULT 0,
	"synced_orders" integer DEFAULT 0,
	"synced_invoices" integer DEFAULT 0,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "erp_sync_log" (
	"id" text PRIMARY KEY NOT NULL,
	"connection_id" text NOT NULL,
	"org_id" text NOT NULL,
	"entity" text NOT NULL,
	"status" text NOT NULL,
	"records_in" integer DEFAULT 0,
	"records_out" integer DEFAULT 0,
	"error" text,
	"detail" jsonb,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "contact_send_time_predictions" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"contact_id" text NOT NULL,
	"best_hour_utc" integer NOT NULL,
	"second_best_hour_utc" integer,
	"confidence" real DEFAULT 0 NOT NULL,
	"hourly_open_rates" text,
	"sample_size" integer DEFAULT 0 NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channel_fallback_log" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"rule_id" text NOT NULL,
	"contact_id" text NOT NULL,
	"primary_channel" text NOT NULL,
	"fallback_channel" text NOT NULL,
	"trigger_reason" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channel_fallback_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"name" text NOT NULL,
	"primary_channel" text DEFAULT 'email' NOT NULL,
	"trigger" text NOT NULL,
	"trigger_param" integer,
	"fallback_channel" text NOT NULL,
	"fallback_template_id" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unsubscribe_experiments" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"winner_variant_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unsubscribe_variants" (
	"id" text PRIMARY KEY NOT NULL,
	"experiment_id" text NOT NULL,
	"org_id" text NOT NULL,
	"name" text NOT NULL,
	"flow" text NOT NULL,
	"headline" text,
	"body_text" text,
	"cta_label" text,
	"pause_days" integer,
	"traffic_weight" real DEFAULT 0.5 NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"saved_count" integer DEFAULT 0 NOT NULL,
	"unsub_count" integer DEFAULT 0 NOT NULL,
	"is_control" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contacts" ALTER COLUMN "lead_score" SET DATA TYPE integer;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "billing_type" "billing_type" DEFAULT 'contact_based' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "monthly_send_quota" integer;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "parent_org_id" uuid;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "data_region" "data_region" DEFAULT 'us' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "ip_restrictions_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "hipaa_mode" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "tracking_eu_strict" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "sandbox_of_org_id" uuid;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "sandbox_mode" varchar(16) DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "lifecycle_stage" "lifecycle_stage" DEFAULT 'subscriber' NOT NULL;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "lifecycle_stage_entered_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "complaint_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "gender" varchar(10);--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "preferred_locale" varchar(8);--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "team_id" uuid;--> statement-breakpoint
ALTER TABLE "contact_lists" ADD COLUMN "unsubscribed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "contact_lists" ADD COLUMN "unsubscribed_reason" varchar(255);--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN "locale" varchar(8) DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN "translation_group_id" uuid;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "utm_tracking" jsonb;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "parent_campaign_id" uuid;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "auto_resend_config" jsonb;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "locale" varchar(8) DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE "email_events" ADD COLUMN "stream" "message_stream" DEFAULT 'broadcast' NOT NULL;--> statement-breakpoint
ALTER TABLE "email_events" ADD COLUMN "ab_variant_id" varchar(100);--> statement-breakpoint
ALTER TABLE "email_events" ADD COLUMN "is_bot" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "email_events" ADD COLUMN "bot_score" real;--> statement-breakpoint
ALTER TABLE "email_events" ADD COLUMN "bot_reason" varchar(255);--> statement-breakpoint
ALTER TABLE "email_events" ADD COLUMN "mpp_detected" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "email_events" ADD COLUMN "mpp_real_open_prob" real;--> statement-breakpoint
ALTER TABLE "lifecycle_stage_history" ADD CONSTRAINT "lifecycle_stage_history_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lifecycle_stage_history" ADD CONSTRAINT "lifecycle_stage_history_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "segments" ADD CONSTRAINT "segments_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "frequency_suppressions" ADD CONSTRAINT "frequency_suppressions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "frequency_suppressions" ADD CONSTRAINT "frequency_suppressions_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_frequency_rules" ADD CONSTRAINT "org_frequency_rules_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_field_definitions" ADD CONSTRAINT "custom_field_definitions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_kits" ADD CONSTRAINT "brand_kits_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_blocks" ADD CONSTRAINT "saved_blocks_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_blocks" ADD CONSTRAINT "saved_blocks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sending_domains" ADD CONSTRAINT "sending_domains_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warmup_ips" ADD CONSTRAINT "warmup_ips_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_alerts" ADD CONSTRAINT "campaign_alerts_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_alerts" ADD CONSTRAINT "campaign_alerts_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_preview_jobs" ADD CONSTRAINT "inbox_preview_jobs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_preview_jobs" ADD CONSTRAINT "inbox_preview_jobs_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_events" ADD CONSTRAINT "workflow_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_events" ADD CONSTRAINT "workflow_events_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_score_events" ADD CONSTRAINT "lead_score_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_score_events" ADD CONSTRAINT "lead_score_events_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_score_rules" ADD CONSTRAINT "lead_score_rules_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_webhook_id_webhooks_id_fk" FOREIGN KEY ("webhook_id") REFERENCES "public"."webhooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "migration_jobs" ADD CONSTRAINT "migration_jobs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signup_form_submissions" ADD CONSTRAINT "signup_form_submissions_form_id_signup_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."signup_forms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signup_form_submissions" ADD CONSTRAINT "signup_form_submissions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signup_form_submissions" ADD CONSTRAINT "signup_form_submissions_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signup_form_variants" ADD CONSTRAINT "signup_form_variants_form_id_signup_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."signup_forms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signup_form_variants" ADD CONSTRAINT "signup_form_variants_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signup_forms" ADD CONSTRAINT "signup_forms_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_agent_id_users_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_responses" ADD CONSTRAINT "survey_responses_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_responses" ADD CONSTRAINT "survey_responses_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_responses" ADD CONSTRAINT "survey_responses_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "surveys" ADD CONSTRAINT "surveys_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_groups" ADD CONSTRAINT "contact_groups_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_groups" ADD CONSTRAINT "contact_groups_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_categories" ADD CONSTRAINT "group_categories_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_category_id_group_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."group_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revenue_events" ADD CONSTRAINT "revenue_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revenue_events" ADD CONSTRAINT "revenue_events_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revenue_events" ADD CONSTRAINT "revenue_events_attributed_campaign_id_campaigns_id_fk" FOREIGN KEY ("attributed_campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_feeds" ADD CONSTRAINT "product_feeds_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_authors" ADD CONSTRAINT "blog_authors_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_authors" ADD CONSTRAINT "blog_authors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_categories" ADD CONSTRAINT "blog_categories_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_post_revisions" ADD CONSTRAINT "blog_post_revisions_post_id_blog_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."blog_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_post_revisions" ADD CONSTRAINT "blog_post_revisions_saved_by_user_id_users_id_fk" FOREIGN KEY ("saved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_posts" ADD CONSTRAINT "blog_posts_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_posts" ADD CONSTRAINT "blog_posts_author_id_blog_authors_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."blog_authors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_posts" ADD CONSTRAINT "blog_posts_category_id_blog_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."blog_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cta_impressions" ADD CONSTRAINT "cta_impressions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cta_impressions" ADD CONSTRAINT "cta_impressions_cta_id_ctas_id_fk" FOREIGN KEY ("cta_id") REFERENCES "public"."ctas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cta_variants" ADD CONSTRAINT "cta_variants_cta_id_ctas_id_fk" FOREIGN KEY ("cta_id") REFERENCES "public"."ctas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ctas" ADD CONSTRAINT "ctas_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_queries" ADD CONSTRAINT "saved_queries_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_queries" ADD CONSTRAINT "saved_queries_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "two_factor_secrets" ADD CONSTRAINT "two_factor_secrets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_apps" ADD CONSTRAINT "oauth_apps_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_codes" ADD CONSTRAINT "oauth_codes_app_id_oauth_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."oauth_apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_codes" ADD CONSTRAINT "oauth_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_codes" ADD CONSTRAINT "oauth_codes_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_tokens" ADD CONSTRAINT "oauth_tokens_app_id_oauth_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."oauth_apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_tokens" ADD CONSTRAINT "oauth_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_tokens" ADD CONSTRAINT "oauth_tokens_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rss_campaigns" ADD CONSTRAINT "rss_campaigns_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rss_campaigns" ADD CONSTRAINT "rss_campaigns_list_id_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."lists"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_engagement" ADD CONSTRAINT "contact_engagement_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_engagement" ADD CONSTRAINT "contact_engagement_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_emails" ADD CONSTRAINT "contact_emails_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_emails" ADD CONSTRAINT "contact_emails_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_channel_consents" ADD CONSTRAINT "contact_channel_consents_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_channel_consents" ADD CONSTRAINT "contact_channel_consents_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_send_log" ADD CONSTRAINT "contact_send_log_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_send_log" ADD CONSTRAINT "contact_send_log_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "smart_sending_rules" ADD CONSTRAINT "smart_sending_rules_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiet_hours" ADD CONSTRAINT "quiet_hours_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "back_in_stock_subscriptions" ADD CONSTRAINT "back_in_stock_subscriptions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "back_in_stock_subscriptions" ADD CONSTRAINT "back_in_stock_subscriptions_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_drop_subscriptions" ADD CONSTRAINT "price_drop_subscriptions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_drop_subscriptions" ADD CONSTRAINT "price_drop_subscriptions_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_batches" ADD CONSTRAINT "coupon_batches_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_codes" ADD CONSTRAINT "coupon_codes_batch_id_coupon_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."coupon_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_codes" ADD CONSTRAINT "coupon_codes_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_codes" ADD CONSTRAINT "coupon_codes_assigned_to_contacts_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_requests" ADD CONSTRAINT "review_requests_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_requests" ADD CONSTRAINT "review_requests_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_requests" ADD CONSTRAINT "review_requests_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_moderated_by_user_id_users_id_fk" FOREIGN KEY ("moderated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_reports" ADD CONSTRAINT "scheduled_reports_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holdout_group_members" ADD CONSTRAINT "holdout_group_members_group_id_holdout_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."holdout_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holdout_group_members" ADD CONSTRAINT "holdout_group_members_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holdout_groups" ADD CONSTRAINT "holdout_groups_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "helpdesk_tickets" ADD CONSTRAINT "helpdesk_tickets_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "helpdesk_tickets" ADD CONSTRAINT "helpdesk_tickets_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "helpdesk_tickets" ADD CONSTRAINT "helpdesk_tickets_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_ticket_id_helpdesk_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."helpdesk_tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_syncs" ADD CONSTRAINT "warehouse_syncs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_keywords" ADD CONSTRAINT "sms_keywords_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_keywords" ADD CONSTRAINT "sms_keywords_list_id_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."lists"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anonymous_profiles" ADD CONSTRAINT "anonymous_profiles_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anonymous_profiles" ADD CONSTRAINT "anonymous_profiles_merged_into_contacts_id_fk" FOREIGN KEY ("merged_into") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rcs_messages" ADD CONSTRAINT "rcs_messages_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rcs_messages" ADD CONSTRAINT "rcs_messages_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ip_restrictions" ADD CONSTRAINT "ip_restrictions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "viber_templates" ADD CONSTRAINT "viber_templates_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_agent_runs" ADD CONSTRAINT "ai_agent_runs_agent_id_ai_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."ai_agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_agents" ADD CONSTRAINT "ai_agents_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "multivariate_tests" ADD CONSTRAINT "multivariate_tests_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "multivariate_tests" ADD CONSTRAINT "multivariate_tests_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mv_test_variants" ADD CONSTRAINT "mv_test_variants_test_id_multivariate_tests_id_fk" FOREIGN KEY ("test_id") REFERENCES "public"."multivariate_tests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mv_test_variants" ADD CONSTRAINT "mv_test_variants_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mv_variant_assignments" ADD CONSTRAINT "mv_variant_assignments_test_id_multivariate_tests_id_fk" FOREIGN KEY ("test_id") REFERENCES "public"."multivariate_tests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mv_variant_assignments" ADD CONSTRAINT "mv_variant_assignments_variant_id_mv_test_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."mv_test_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dedicated_ips" ADD CONSTRAINT "dedicated_ips_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dedicated_ips" ADD CONSTRAINT "dedicated_ips_pool_id_ip_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."ip_pools"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ip_pools" ADD CONSTRAINT "ip_pools_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ip_warmup_schedules" ADD CONSTRAINT "ip_warmup_schedules_pool_id_ip_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."ip_pools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "abuse_events" ADD CONSTRAINT "abuse_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "abuse_events" ADD CONSTRAINT "abuse_events_rule_id_abuse_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."abuse_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "abuse_events" ADD CONSTRAINT "abuse_events_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "abuse_rules" ADD CONSTRAINT "abuse_rules_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "abuse_sanctions" ADD CONSTRAINT "abuse_sanctions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "abuse_sanctions" ADD CONSTRAINT "abuse_sanctions_event_id_abuse_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."abuse_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spam_trap_hits" ADD CONSTRAINT "spam_trap_hits_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spam_trap_hits" ADD CONSTRAINT "spam_trap_hits_trap_id_spam_traps_id_fk" FOREIGN KEY ("trap_id") REFERENCES "public"."spam_traps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spam_trap_hits" ADD CONSTRAINT "spam_trap_hits_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "isp_fbl_registrations" ADD CONSTRAINT "isp_fbl_registrations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ecommerce_connections" ADD CONSTRAINT "ecommerce_connections_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ecommerce_orders" ADD CONSTRAINT "ecommerce_orders_connection_id_ecommerce_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."ecommerce_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ecommerce_orders" ADD CONSTRAINT "ecommerce_orders_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ecommerce_webhook_events" ADD CONSTRAINT "ecommerce_webhook_events_connection_id_ecommerce_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."ecommerce_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_page_views" ADD CONSTRAINT "product_page_views_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_page_views" ADD CONSTRAINT "product_page_views_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_emails" ADD CONSTRAINT "inbound_emails_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_emails" ADD CONSTRAINT "inbound_emails_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sso_configurations" ADD CONSTRAINT "sso_configurations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sso_login_states" ADD CONSTRAINT "sso_login_states_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_reviews" ADD CONSTRAINT "access_reviews_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_reviews" ADD CONSTRAINT "access_reviews_reviewer_user_id_users_id_fk" FOREIGN KEY ("reviewer_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_controls" ADD CONSTRAINT "compliance_controls_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_controls" ADD CONSTRAINT "compliance_controls_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_retention_policies" ADD CONSTRAINT "data_retention_policies_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_object_definitions" ADD CONSTRAINT "custom_object_definitions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_object_records" ADD CONSTRAINT "custom_object_records_object_def_id_custom_object_definitions_id_fk" FOREIGN KEY ("object_def_id") REFERENCES "public"."custom_object_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_object_relations" ADD CONSTRAINT "custom_object_relations_record_id_custom_object_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."custom_object_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesforce_connections" ADD CONSTRAINT "salesforce_connections_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raynet_company_map" ADD CONSTRAINT "raynet_company_map_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raynet_company_map" ADD CONSTRAINT "raynet_company_map_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raynet_connections" ADD CONSTRAINT "raynet_connections_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raynet_contact_map" ADD CONSTRAINT "raynet_contact_map_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raynet_contact_map" ADD CONSTRAINT "raynet_contact_map_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raynet_deal_map" ADD CONSTRAINT "raynet_deal_map_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raynet_deal_map" ADD CONSTRAINT "raynet_deal_map_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_studio_actions" ADD CONSTRAINT "app_studio_actions_app_id_app_studio_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."app_studio_apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_studio_apps" ADD CONSTRAINT "app_studio_apps_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_studio_triggers" ADD CONSTRAINT "app_studio_triggers_app_id_app_studio_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."app_studio_apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_studio_webhook_subscribers" ADD CONSTRAINT "app_studio_webhook_subscribers_app_id_app_studio_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."app_studio_apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequence_enrollments" ADD CONSTRAINT "sequence_enrollments_sequence_id_sales_sequences_id_fk" FOREIGN KEY ("sequence_id") REFERENCES "public"."sales_sequences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequence_step_logs" ADD CONSTRAINT "sequence_step_logs_enrollment_id_sequence_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."sequence_enrollments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_events" ADD CONSTRAINT "site_events_site_id_tracked_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."tracked_sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_page_views" ADD CONSTRAINT "site_page_views_site_id_tracked_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."tracked_sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_message_impressions" ADD CONSTRAINT "site_message_impressions_message_id_site_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."site_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dmarc_reports" ADD CONSTRAINT "dmarc_reports_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_programs" ADD CONSTRAINT "loyalty_programs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_members" ADD CONSTRAINT "loyalty_members_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_members" ADD CONSTRAINT "loyalty_members_program_id_loyalty_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."loyalty_programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_members" ADD CONSTRAINT "loyalty_members_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_points" ADD CONSTRAINT "loyalty_points_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_points" ADD CONSTRAINT "loyalty_points_member_id_loyalty_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."loyalty_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_redemptions" ADD CONSTRAINT "loyalty_redemptions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_redemptions" ADD CONSTRAINT "loyalty_redemptions_reward_id_loyalty_rewards_id_fk" FOREIGN KEY ("reward_id") REFERENCES "public"."loyalty_rewards"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_rewards" ADD CONSTRAINT "loyalty_rewards_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_rewards" ADD CONSTRAINT "loyalty_rewards_program_id_loyalty_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."loyalty_programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_earning_rules" ADD CONSTRAINT "loyalty_earning_rules_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_earning_rules" ADD CONSTRAINT "loyalty_earning_rules_program_id_loyalty_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."loyalty_programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_associate_agreements" ADD CONSTRAINT "business_associate_agreements_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_associate_agreements" ADD CONSTRAINT "business_associate_agreements_signed_by_user_id_users_id_fk" FOREIGN KEY ("signed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hipaa_access_log" ADD CONSTRAINT "hipaa_access_log_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hipaa_access_log" ADD CONSTRAINT "hipaa_access_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phi_field_flags" ADD CONSTRAINT "phi_field_flags_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phi_field_flags" ADD CONSTRAINT "phi_field_flags_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_presence" ADD CONSTRAINT "agent_presence_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_presence" ADD CONSTRAINT "agent_presence_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_hours" ADD CONSTRAINT "business_hours_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hunt_groups" ADD CONSTRAINT "hunt_groups_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ivr_menus" ADD CONSTRAINT "ivr_menus_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_host_user_id_users_id_fk" FOREIGN KEY ("host_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_integration_id_calendar_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."calendar_integrations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_integration_id_calendar_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."calendar_integrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_integrations" ADD CONSTRAINT "calendar_integrations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_integrations" ADD CONSTRAINT "calendar_integrations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_merges" ADD CONSTRAINT "identity_merges_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_signals" ADD CONSTRAINT "identity_signals_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_signals" ADD CONSTRAINT "identity_signals_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activation_destinations" ADD CONSTRAINT "activation_destinations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activation_runs" ADD CONSTRAINT "activation_runs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activation_runs" ADD CONSTRAINT "activation_runs_destination_id_activation_destinations_id_fk" FOREIGN KEY ("destination_id") REFERENCES "public"."activation_destinations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cdp_events" ADD CONSTRAINT "cdp_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cdp_events" ADD CONSTRAINT "cdp_events_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_traits" ADD CONSTRAINT "contact_traits_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_traits" ADD CONSTRAINT "contact_traits_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hubspot_connections" ADD CONSTRAINT "hubspot_connections_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hubspot_contact_map" ADD CONSTRAINT "hubspot_contact_map_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hubspot_contact_map" ADD CONSTRAINT "hubspot_contact_map_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hubspot_deal_map" ADD CONSTRAINT "hubspot_deal_map_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hubspot_deal_map" ADD CONSTRAINT "hubspot_deal_map_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendly_connections" ADD CONSTRAINT "calendly_connections_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_availability" ADD CONSTRAINT "agent_availability_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_availability" ADD CONSTRAINT "agent_availability_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_routing_rules" ADD CONSTRAINT "chat_routing_rules_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_assignments" ADD CONSTRAINT "ticket_assignments_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_assignments" ADD CONSTRAINT "ticket_assignments_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_assignments" ADD CONSTRAINT "ticket_assignments_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phone_number_port_requests" ADD CONSTRAINT "phone_number_port_requests_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phone_numbers" ADD CONSTRAINT "phone_numbers_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phone_numbers" ADD CONSTRAINT "phone_numbers_assigned_user_id_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_availability" ADD CONSTRAINT "booking_availability_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_availability" ADD CONSTRAINT "booking_availability_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_pages" ADD CONSTRAINT "booking_pages_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_pages" ADD CONSTRAINT "booking_pages_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_types" ADD CONSTRAINT "event_types_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_types" ADD CONSTRAINT "event_types_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round_robin_state" ADD CONSTRAINT "round_robin_state_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round_robin_state" ADD CONSTRAINT "round_robin_state_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cdp_sources" ADD CONSTRAINT "cdp_sources_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cdp_sync_runs" ADD CONSTRAINT "cdp_sync_runs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cdp_sync_runs" ADD CONSTRAINT "cdp_sync_runs_source_id_cdp_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."cdp_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_balances" ADD CONSTRAINT "credit_balances_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_meter_events" ADD CONSTRAINT "product_meter_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_usage_meters" ADD CONSTRAINT "product_usage_meters_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seo_audit_results" ADD CONSTRAINT "seo_audit_results_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seo_cluster_pages" ADD CONSTRAINT "seo_cluster_pages_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seo_cluster_pages" ADD CONSTRAINT "seo_cluster_pages_cluster_id_seo_topic_clusters_id_fk" FOREIGN KEY ("cluster_id") REFERENCES "public"."seo_topic_clusters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seo_keywords" ADD CONSTRAINT "seo_keywords_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seo_rank_snapshots" ADD CONSTRAINT "seo_rank_snapshots_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seo_rank_snapshots" ADD CONSTRAINT "seo_rank_snapshots_tracking_id_seo_rank_tracking_id_fk" FOREIGN KEY ("tracking_id") REFERENCES "public"."seo_rank_tracking"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seo_rank_tracking" ADD CONSTRAINT "seo_rank_tracking_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seo_topic_clusters" ADD CONSTRAINT "seo_topic_clusters_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_accounts" ADD CONSTRAINT "social_accounts_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_oauth_states" ADD CONSTRAINT "social_oauth_states_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_analytics_snapshots" ADD CONSTRAINT "social_analytics_snapshots_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_analytics_snapshots" ADD CONSTRAINT "social_analytics_snapshots_account_id_social_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."social_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_mentions" ADD CONSTRAINT "social_mentions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_monitoring_keywords" ADD CONSTRAINT "social_monitoring_keywords_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_accounts" ADD CONSTRAINT "ad_accounts_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_audience_syncs" ADD CONSTRAINT "ad_audience_syncs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_audience_syncs" ADD CONSTRAINT "ad_audience_syncs_ad_account_id_ad_accounts_id_fk" FOREIGN KEY ("ad_account_id") REFERENCES "public"."ad_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_performance_snapshots" ADD CONSTRAINT "ad_performance_snapshots_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_performance_snapshots" ADD CONSTRAINT "ad_performance_snapshots_ad_account_id_ad_accounts_id_fk" FOREIGN KEY ("ad_account_id") REFERENCES "public"."ad_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_changes" ADD CONSTRAINT "subscription_changes_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_changes" ADD CONSTRAINT "subscription_changes_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lifecycle_rules" ADD CONSTRAINT "lifecycle_rules_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "associations" ADD CONSTRAINT "associations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_messages" ADD CONSTRAINT "video_messages_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_messages" ADD CONSTRAINT "video_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_messages" ADD CONSTRAINT "video_messages_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_play_events" ADD CONSTRAINT "video_play_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_play_events" ADD CONSTRAINT "video_play_events_video_id_video_messages_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."video_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_chunks" ADD CONSTRAINT "kb_chunks_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_chunks" ADD CONSTRAINT "kb_chunks_document_id_kb_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."kb_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_documents" ADD CONSTRAINT "kb_documents_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_sandboxes" ADD CONSTRAINT "org_sandboxes_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_sandboxes" ADD CONSTRAINT "org_sandboxes_sandbox_org_id_organizations_id_fk" FOREIGN KEY ("sandbox_org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "field_permissions" ADD CONSTRAINT "field_permissions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_channels" ADD CONSTRAINT "custom_channels_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calculated_properties" ADD CONSTRAINT "calculated_properties_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calculated_property_values" ADD CONSTRAINT "calculated_property_values_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calculated_property_values" ADD CONSTRAINT "calculated_property_values_prop_id_calculated_properties_id_fk" FOREIGN KEY ("prop_id") REFERENCES "public"."calculated_properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_sync_conflicts" ADD CONSTRAINT "data_sync_conflicts_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_sync_conflicts" ADD CONSTRAINT "data_sync_conflicts_pair_id_data_sync_pairs_id_fk" FOREIGN KEY ("pair_id") REFERENCES "public"."data_sync_pairs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_sync_mappings" ADD CONSTRAINT "data_sync_mappings_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_sync_pairs" ADD CONSTRAINT "data_sync_pairs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_pipeline_runs" ADD CONSTRAINT "data_pipeline_runs_pipeline_id_data_pipelines_id_fk" FOREIGN KEY ("pipeline_id") REFERENCES "public"."data_pipelines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_pipeline_runs" ADD CONSTRAINT "data_pipeline_runs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_pipelines" ADD CONSTRAINT "data_pipelines_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_gdpr_consents" ADD CONSTRAINT "contact_gdpr_consents_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_gdpr_consents" ADD CONSTRAINT "contact_gdpr_consents_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_gdpr_consents" ADD CONSTRAINT "contact_gdpr_consents_purpose_id_processing_purposes_id_fk" FOREIGN KEY ("purpose_id") REFERENCES "public"."processing_purposes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processing_purposes" ADD CONSTRAINT "processing_purposes_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wheel_spins" ADD CONSTRAINT "wheel_spins_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wheel_spins" ADD CONSTRAINT "wheel_spins_form_id_signup_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."signup_forms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wheel_spins" ADD CONSTRAINT "wheel_spins_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_messages" ADD CONSTRAINT "inbox_messages_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_messages" ADD CONSTRAINT "inbox_messages_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_feeds" ADD CONSTRAINT "external_feeds_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ab_test_holdbacks" ADD CONSTRAINT "ab_test_holdbacks_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ab_test_holdbacks" ADD CONSTRAINT "ab_test_holdbacks_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ab_test_results" ADD CONSTRAINT "ab_test_results_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ab_test_results" ADD CONSTRAINT "ab_test_results_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playbook_runs" ADD CONSTRAINT "playbook_runs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playbook_runs" ADD CONSTRAINT "playbook_runs_playbook_id_playbooks_id_fk" FOREIGN KEY ("playbook_id") REFERENCES "public"."playbooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playbook_runs" ADD CONSTRAINT "playbook_runs_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playbook_runs" ADD CONSTRAINT "playbook_runs_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playbook_runs" ADD CONSTRAINT "playbook_runs_assigned_user_id_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playbooks" ADD CONSTRAINT "playbooks_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rotation_assignment_logs" ADD CONSTRAINT "rotation_assignment_logs_config_id_rotation_configs_id_fk" FOREIGN KEY ("config_id") REFERENCES "public"."rotation_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rotation_assignment_logs" ADD CONSTRAINT "rotation_assignment_logs_assigned_user_id_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rotation_configs" ADD CONSTRAINT "rotation_configs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_templates" ADD CONSTRAINT "quote_templates_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intent_scores" ADD CONSTRAINT "intent_scores_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intent_signals" ADD CONSTRAINT "intent_signals_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intent_signals" ADD CONSTRAINT "intent_signals_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_extension_cards" ADD CONSTRAINT "crm_extension_cards_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_extension_cards" ADD CONSTRAINT "crm_extension_cards_app_id_app_studio_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."app_studio_apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lifecycle_history_contact_idx" ON "lifecycle_stage_history" USING btree ("contact_id","occurred_at");--> statement-breakpoint
CREATE INDEX "lifecycle_history_org_idx" ON "lifecycle_stage_history" USING btree ("org_id","occurred_at");--> statement-breakpoint
CREATE INDEX "import_jobs_org_id_idx" ON "import_jobs" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "import_jobs_org_status_idx" ON "import_jobs" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "segments_org_id_idx" ON "segments" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "frequency_suppressions_org_at_idx" ON "frequency_suppressions" USING btree ("org_id","suppressed_at");--> statement-breakpoint
CREATE INDEX "frequency_suppressions_contact_idx" ON "frequency_suppressions" USING btree ("contact_id","suppressed_at");--> statement-breakpoint
CREATE INDEX "frequency_suppressions_reason_idx" ON "frequency_suppressions" USING btree ("org_id","reason");--> statement-breakpoint
CREATE INDEX "org_frequency_rules_org_idx" ON "org_frequency_rules" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "org_frequency_rules_org_channel_idx" ON "org_frequency_rules" USING btree ("org_id","channel");--> statement-breakpoint
CREATE UNIQUE INDEX "custom_field_defs_org_key_idx" ON "custom_field_definitions" USING btree ("org_id","key");--> statement-breakpoint
CREATE INDEX "saved_blocks_org_idx" ON "saved_blocks" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "saved_blocks_org_category_idx" ON "saved_blocks" USING btree ("org_id","category");--> statement-breakpoint
CREATE INDEX "saved_blocks_tgroup_idx" ON "saved_blocks" USING btree ("translation_group_id");--> statement-breakpoint
CREATE INDEX "sending_domains_org_idx" ON "sending_domains" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sending_domains_org_domain_idx" ON "sending_domains" USING btree ("org_id","domain");--> statement-breakpoint
CREATE UNIQUE INDEX "warmup_ips_ip_idx" ON "warmup_ips" USING btree ("ip_address");--> statement-breakpoint
CREATE INDEX "warmup_ips_org_idx" ON "warmup_ips" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "campaign_alerts_org_id_idx" ON "campaign_alerts" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "campaign_alerts_campaign_id_idx" ON "campaign_alerts" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "campaign_alerts_created_at_idx" ON "campaign_alerts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "campaign_alerts_acknowledged_idx" ON "campaign_alerts" USING btree ("acknowledged");--> statement-breakpoint
CREATE INDEX "inbox_preview_jobs_org_idx" ON "inbox_preview_jobs" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "inbox_preview_jobs_campaign_idx" ON "inbox_preview_jobs" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "inbox_preview_jobs_status_idx" ON "inbox_preview_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ai_usage_org_id_idx" ON "ai_usage" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "ai_usage_feature_idx" ON "ai_usage" USING btree ("feature");--> statement-breakpoint
CREATE INDEX "ai_usage_created_at_idx" ON "ai_usage" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "workflow_events_org_id_idx" ON "workflow_events" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "workflow_events_contact_id_idx" ON "workflow_events" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "workflow_events_event_name_idx" ON "workflow_events" USING btree ("event_name");--> statement-breakpoint
CREATE INDEX "workflow_events_processed_idx" ON "workflow_events" USING btree ("processed");--> statement-breakpoint
CREATE INDEX "workflow_events_created_at_idx" ON "workflow_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "workflow_runs_workflow_id_idx" ON "workflow_runs" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "workflow_runs_contact_id_idx" ON "workflow_runs" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "workflow_runs_status_idx" ON "workflow_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "workflow_runs_next_execution_at_idx" ON "workflow_runs" USING btree ("next_execution_at");--> statement-breakpoint
CREATE INDEX "workflow_runs_org_id_idx" ON "workflow_runs" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "workflows_org_id_idx" ON "workflows" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "workflows_status_idx" ON "workflows" USING btree ("status");--> statement-breakpoint
CREATE INDEX "workflows_trigger_type_idx" ON "workflows" USING btree ("trigger_type");--> statement-breakpoint
CREATE INDEX "lead_score_events_contact_id_idx" ON "lead_score_events" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "lead_score_events_org_id_idx" ON "lead_score_events" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "lead_score_events_created_at_idx" ON "lead_score_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "lead_score_rules_org_id_idx" ON "lead_score_rules" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "lead_score_rules_event_type_idx" ON "lead_score_rules" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "api_keys_org_id_idx" ON "api_keys" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "api_keys_key_hash_idx" ON "api_keys" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "webhook_deliveries_webhook_id_idx" ON "webhook_deliveries" USING btree ("webhook_id");--> statement-breakpoint
CREATE INDEX "webhook_deliveries_org_id_idx" ON "webhook_deliveries" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "webhook_deliveries_status_idx" ON "webhook_deliveries" USING btree ("status");--> statement-breakpoint
CREATE INDEX "webhook_deliveries_next_retry_at_idx" ON "webhook_deliveries" USING btree ("next_retry_at");--> statement-breakpoint
CREATE INDEX "webhooks_org_id_idx" ON "webhooks" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "webhooks_active_idx" ON "webhooks" USING btree ("active");--> statement-breakpoint
CREATE INDEX "migration_jobs_org_id_idx" ON "migration_jobs" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "migration_jobs_status_idx" ON "migration_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "signup_form_submissions_form_id_idx" ON "signup_form_submissions" USING btree ("form_id");--> statement-breakpoint
CREATE INDEX "signup_form_submissions_org_id_idx" ON "signup_form_submissions" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "signup_form_submissions_contact_id_idx" ON "signup_form_submissions" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "signup_form_variants_form_id_idx" ON "signup_form_variants" USING btree ("form_id");--> statement-breakpoint
CREATE INDEX "signup_form_variants_org_id_idx" ON "signup_form_variants" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "signup_forms_org_id_idx" ON "signup_forms" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "signup_forms_active_idx" ON "signup_forms" USING btree ("active");--> statement-breakpoint
CREATE UNIQUE INDEX "sms_consents_org_phone_idx" ON "sms_consents" USING btree ("org_id","phone");--> statement-breakpoint
CREATE INDEX "sms_consents_org_contact_idx" ON "sms_consents" USING btree ("org_id","contact_id");--> statement-breakpoint
CREATE INDEX "sms_inbound_org_idx" ON "sms_inbound" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "sms_inbound_from_phone_idx" ON "sms_inbound" USING btree ("from_phone");--> statement-breakpoint
CREATE INDEX "sms_inbound_provider_msg_idx" ON "sms_inbound" USING btree ("provider_message_id");--> statement-breakpoint
CREATE INDEX "sms_routes_org_country_idx" ON "sms_routes" USING btree ("org_id","country_code");--> statement-breakpoint
CREATE INDEX "sms_routes_priority_idx" ON "sms_routes" USING btree ("org_id","country_code","priority");--> statement-breakpoint
CREATE INDEX "sms_send_log_org_idx" ON "sms_send_log" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "sms_send_log_contact_idx" ON "sms_send_log" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "sms_send_log_provider_msg_idx" ON "sms_send_log" USING btree ("provider_message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wa_consents_org_phone_idx" ON "whatsapp_consents" USING btree ("org_id","phone");--> statement-breakpoint
CREATE INDEX "wa_conversations_org_idx" ON "whatsapp_conversations" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "wa_conversations_contact_idx" ON "whatsapp_conversations" USING btree ("org_id","contact_phone");--> statement-breakpoint
CREATE INDEX "wa_phone_numbers_org_idx" ON "whatsapp_phone_numbers" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wa_phone_numbers_id_idx" ON "whatsapp_phone_numbers" USING btree ("org_id","phone_number_id");--> statement-breakpoint
CREATE INDEX "wa_templates_org_idx" ON "whatsapp_templates" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wa_templates_org_name_lang_idx" ON "whatsapp_templates" USING btree ("org_id","name","language");--> statement-breakpoint
CREATE INDEX "wa_templates_status_idx" ON "whatsapp_templates" USING btree ("status");--> statement-breakpoint
CREATE INDEX "push_send_log_org_idx" ON "push_send_log" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "push_send_log_contact_idx" ON "push_send_log" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "push_subscriptions_org_idx" ON "push_subscriptions" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "push_subscriptions_contact_idx" ON "push_subscriptions" USING btree ("contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscriptions_endpoint_idx" ON "push_subscriptions" USING btree ("endpoint");--> statement-breakpoint
CREATE UNIQUE INDEX "vapid_keys_org_idx" ON "vapid_keys" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "in_app_impressions_message_idx" ON "in_app_impressions" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "in_app_impressions_contact_idx" ON "in_app_impressions" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "in_app_impressions_session_idx" ON "in_app_impressions" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "in_app_messages_org_idx" ON "in_app_messages" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "in_app_messages_org_active_idx" ON "in_app_messages" USING btree ("org_id","active");--> statement-breakpoint
CREATE INDEX "calls_org_id_idx" ON "calls" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "calls_contact_id_idx" ON "calls" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "calls_campaign_id_idx" ON "calls" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "calls_agent_id_idx" ON "calls" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "calls_deal_id_idx" ON "calls" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX "calls_status_idx" ON "calls" USING btree ("status");--> statement-breakpoint
CREATE INDEX "calls_created_at_idx" ON "calls" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "calls_org_contact_idx" ON "calls" USING btree ("org_id","contact_id");--> statement-breakpoint
CREATE INDEX "media_assets_org_idx" ON "media_assets" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "media_assets_folder_idx" ON "media_assets" USING btree ("org_id","folder");--> statement-breakpoint
CREATE INDEX "survey_responses_survey_idx" ON "survey_responses" USING btree ("survey_id");--> statement-breakpoint
CREATE INDEX "survey_responses_contact_idx" ON "survey_responses" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "surveys_org_idx" ON "surveys" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contact_groups_pk" ON "contact_groups" USING btree ("contact_id","group_id");--> statement-breakpoint
CREATE INDEX "contact_groups_group_idx" ON "contact_groups" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "group_categories_org_idx" ON "group_categories" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "groups_category_idx" ON "groups" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "revenue_events_org_idx" ON "revenue_events" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "revenue_events_contact_idx" ON "revenue_events" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "revenue_events_campaign_idx" ON "revenue_events" USING btree ("attributed_campaign_id");--> statement-breakpoint
CREATE INDEX "revenue_events_order_idx" ON "revenue_events" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "products_org_idx" ON "products" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "products_sku_idx" ON "products" USING btree ("org_id","sku");--> statement-breakpoint
CREATE UNIQUE INDEX "product_feeds_org_url_uq" ON "product_feeds" USING btree ("org_id","url");--> statement-breakpoint
CREATE INDEX "product_feeds_org_idx" ON "product_feeds" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "product_feeds_next_sync_idx" ON "product_feeds" USING btree ("last_synced_at");--> statement-breakpoint
CREATE UNIQUE INDEX "blog_authors_org_slug_uq" ON "blog_authors" USING btree ("org_id","slug");--> statement-breakpoint
CREATE INDEX "blog_authors_user_idx" ON "blog_authors" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "blog_categories_org_slug_uq" ON "blog_categories" USING btree ("org_id","slug");--> statement-breakpoint
CREATE INDEX "blog_categories_org_idx" ON "blog_categories" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "blog_post_revisions_post_version_uq" ON "blog_post_revisions" USING btree ("post_id","version");--> statement-breakpoint
CREATE INDEX "blog_post_revisions_post_idx" ON "blog_post_revisions" USING btree ("post_id");--> statement-breakpoint
CREATE UNIQUE INDEX "blog_posts_org_slug_locale_uq" ON "blog_posts" USING btree ("org_id","slug","locale");--> statement-breakpoint
CREATE INDEX "blog_posts_org_status_idx" ON "blog_posts" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "blog_posts_org_category_idx" ON "blog_posts" USING btree ("org_id","category_id");--> statement-breakpoint
CREATE INDEX "blog_posts_org_published_at_idx" ON "blog_posts" USING btree ("org_id","published_at");--> statement-breakpoint
CREATE INDEX "blog_posts_translation_group_idx" ON "blog_posts" USING btree ("translation_group_id");--> statement-breakpoint
CREATE INDEX "cta_impressions_cta_idx" ON "cta_impressions" USING btree ("cta_id","occurred_at");--> statement-breakpoint
CREATE INDEX "cta_impressions_variant_idx" ON "cta_impressions" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "cta_impressions_visitor_idx" ON "cta_impressions" USING btree ("visitor_id");--> statement-breakpoint
CREATE INDEX "cta_variants_cta_idx" ON "cta_variants" USING btree ("cta_id");--> statement-breakpoint
CREATE INDEX "ctas_org_idx" ON "ctas" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "ctas_org_active_idx" ON "ctas" USING btree ("org_id","active");--> statement-breakpoint
CREATE INDEX "saved_queries_org_idx" ON "saved_queries" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "saved_queries_owner_idx" ON "saved_queries" USING btree ("owner_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "saved_queries_org_name_uq" ON "saved_queries" USING btree ("org_id","name");--> statement-breakpoint
CREATE INDEX "oauth_apps_org_idx" ON "oauth_apps" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "oauth_tokens_user_idx" ON "oauth_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "oauth_tokens_app_idx" ON "oauth_tokens" USING btree ("app_id");--> statement-breakpoint
CREATE INDEX "rss_campaigns_org_idx" ON "rss_campaigns" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "rss_campaigns_next_run_idx" ON "rss_campaigns" USING btree ("next_run_at");--> statement-breakpoint
CREATE INDEX "contact_engagement_org_idx" ON "contact_engagement" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contact_emails_org_email_uq" ON "contact_emails" USING btree ("org_id",LOWER("email"));--> statement-breakpoint
CREATE INDEX "contact_emails_contact_idx" ON "contact_emails" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "contact_channel_consents_org_idx" ON "contact_channel_consents" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "contact_channel_consents_channel_idx" ON "contact_channel_consents" USING btree ("channel");--> statement-breakpoint
CREATE INDEX "contact_channel_consents_opted_in_idx" ON "contact_channel_consents" USING btree ("opted_in");--> statement-breakpoint
CREATE INDEX "contact_send_log_recent_idx" ON "contact_send_log" USING btree ("org_id","contact_id","channel","sent_at");--> statement-breakpoint
CREATE UNIQUE INDEX "smart_sending_rules_org_ch_uq" ON "smart_sending_rules" USING btree ("org_id","channel");--> statement-breakpoint
CREATE UNIQUE INDEX "quiet_hours_org_ch_uq" ON "quiet_hours" USING btree ("org_id","channel");--> statement-breakpoint
CREATE INDEX "back_in_stock_org_sku_idx" ON "back_in_stock_subscriptions" USING btree ("org_id","sku");--> statement-breakpoint
CREATE INDEX "price_drop_org_sku_idx" ON "price_drop_subscriptions" USING btree ("org_id","sku");--> statement-breakpoint
CREATE INDEX "coupon_batches_org_idx" ON "coupon_batches" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "coupon_codes_org_code_uq" ON "coupon_codes" USING btree ("org_id","code");--> statement-breakpoint
CREATE INDEX "coupon_codes_batch_idx" ON "coupon_codes" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "product_reviews_org_sku_idx" ON "product_reviews" USING btree ("org_id","sku");--> statement-breakpoint
CREATE INDEX "product_reviews_status_idx" ON "product_reviews" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "review_requests_org_contact_idx" ON "review_requests" USING btree ("org_id","contact_id");--> statement-breakpoint
CREATE INDEX "review_requests_token_idx" ON "review_requests" USING btree ("token");--> statement-breakpoint
CREATE INDEX "reviews_org_status_idx" ON "reviews" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "reviews_org_product_idx" ON "reviews" USING btree ("org_id","product_sku");--> statement-breakpoint
CREATE INDEX "reviews_org_created_idx" ON "reviews" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "scheduled_reports_next_run_idx" ON "scheduled_reports" USING btree ("next_run_at");--> statement-breakpoint
CREATE INDEX "holdout_members_contact_idx" ON "holdout_group_members" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "holdout_groups_org_idx" ON "holdout_groups" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "helpdesk_tickets_org_status_idx" ON "helpdesk_tickets" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "helpdesk_tickets_contact_idx" ON "helpdesk_tickets" USING btree ("contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "helpdesk_tickets_org_channel_thread_uq" ON "helpdesk_tickets" USING btree ("org_id","channel","external_thread_id") WHERE external_thread_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "helpdesk_tickets_org_channel_identity_idx" ON "helpdesk_tickets" USING btree ("org_id","channel","external_identity");--> statement-breakpoint
CREATE INDEX "ticket_messages_ticket_idx" ON "ticket_messages" USING btree ("ticket_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ticket_messages_ext_uq" ON "ticket_messages" USING btree ("ticket_id","external_message_id") WHERE external_message_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "warehouse_syncs_org_idx" ON "warehouse_syncs" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sms_keywords_org_kw_uq" ON "sms_keywords" USING btree ("org_id",LOWER("keyword"));--> statement-breakpoint
CREATE UNIQUE INDEX "anon_profiles_org_visitor_uq" ON "anonymous_profiles" USING btree ("org_id","visitor_id");--> statement-breakpoint
CREATE INDEX "anon_profiles_merged_idx" ON "anonymous_profiles" USING btree ("merged_into");--> statement-breakpoint
CREATE INDEX "rcs_messages_org_idx" ON "rcs_messages" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "ip_restrictions_org_idx" ON "ip_restrictions" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "ip_restrictions_org_enabled_idx" ON "ip_restrictions" USING btree ("org_id","enabled");--> statement-breakpoint
CREATE INDEX "viber_templates_org_name_idx" ON "viber_templates" USING btree ("org_id","name");--> statement-breakpoint
CREATE INDEX "viber_templates_org_status_idx" ON "viber_templates" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "ai_agent_runs_agent_idx" ON "ai_agent_runs" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "ai_agent_runs_org_idx" ON "ai_agent_runs" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "ai_agent_runs_status_idx" ON "ai_agent_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ai_agents_org_idx" ON "ai_agents" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "ai_agents_org_type_idx" ON "ai_agents" USING btree ("org_id","agent_type");--> statement-breakpoint
CREATE INDEX "ai_agents_next_run_idx" ON "ai_agents" USING btree ("next_run_at");--> statement-breakpoint
CREATE INDEX "mv_tests_org_idx" ON "multivariate_tests" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "mv_tests_campaign_idx" ON "multivariate_tests" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "mv_tests_status_idx" ON "multivariate_tests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "mv_variants_test_idx" ON "mv_test_variants" USING btree ("test_id");--> statement-breakpoint
CREATE INDEX "mv_variants_org_idx" ON "mv_test_variants" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "mv_assignments_test_contact_idx" ON "mv_variant_assignments" USING btree ("test_id","contact_id");--> statement-breakpoint
CREATE INDEX "mv_assignments_variant_idx" ON "mv_variant_assignments" USING btree ("variant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dedicated_ips_address_idx" ON "dedicated_ips" USING btree ("ip_address");--> statement-breakpoint
CREATE INDEX "dedicated_ips_org_idx" ON "dedicated_ips" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "dedicated_ips_pool_idx" ON "dedicated_ips" USING btree ("pool_id");--> statement-breakpoint
CREATE INDEX "dedicated_ips_status_idx" ON "dedicated_ips" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ip_pools_org_idx" ON "ip_pools" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ip_pools_org_name_idx" ON "ip_pools" USING btree ("org_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "ip_warmup_schedules_pool_day_idx" ON "ip_warmup_schedules" USING btree ("pool_id","day");--> statement-breakpoint
CREATE INDEX "abuse_events_org_idx" ON "abuse_events" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "abuse_events_status_idx" ON "abuse_events" USING btree ("status");--> statement-breakpoint
CREATE INDEX "abuse_events_severity_idx" ON "abuse_events" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "abuse_events_signal_idx" ON "abuse_events" USING btree ("signal_type");--> statement-breakpoint
CREATE INDEX "abuse_events_created_idx" ON "abuse_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "abuse_rules_org_idx" ON "abuse_rules" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "abuse_rules_signal_idx" ON "abuse_rules" USING btree ("signal_type");--> statement-breakpoint
CREATE INDEX "abuse_rules_enabled_idx" ON "abuse_rules" USING btree ("enabled");--> statement-breakpoint
CREATE INDEX "abuse_sanctions_org_idx" ON "abuse_sanctions" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "abuse_sanctions_active_idx" ON "abuse_sanctions" USING btree ("org_id","active");--> statement-breakpoint
CREATE INDEX "abuse_sanctions_expires_idx" ON "abuse_sanctions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "spam_trap_hits_org_idx" ON "spam_trap_hits" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "spam_trap_hits_campaign_idx" ON "spam_trap_hits" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "spam_trap_hits_time_idx" ON "spam_trap_hits" USING btree ("hit_at");--> statement-breakpoint
CREATE UNIQUE INDEX "spam_traps_hash_idx" ON "spam_traps" USING btree ("email_hash");--> statement-breakpoint
CREATE INDEX "spam_traps_active_idx" ON "spam_traps" USING btree ("active");--> statement-breakpoint
CREATE INDEX "isp_fbl_org_idx" ON "isp_fbl_registrations" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "isp_fbl_isp_idx" ON "isp_fbl_registrations" USING btree ("isp");--> statement-breakpoint
CREATE INDEX "ecommerce_connections_org_idx" ON "ecommerce_connections" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "ecommerce_connections_platform_idx" ON "ecommerce_connections" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "ecommerce_connections_status_idx" ON "ecommerce_connections" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "ecommerce_orders_external_uq" ON "ecommerce_orders" USING btree ("connection_id","external_order_id");--> statement-breakpoint
CREATE INDEX "ecommerce_orders_org_idx" ON "ecommerce_orders" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "ecommerce_orders_contact_idx" ON "ecommerce_orders" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "ecommerce_orders_ordered_at_idx" ON "ecommerce_orders" USING btree ("ordered_at");--> statement-breakpoint
CREATE INDEX "ecommerce_webhook_events_conn_idx" ON "ecommerce_webhook_events" USING btree ("connection_id");--> statement-breakpoint
CREATE INDEX "ecommerce_webhook_events_processed_idx" ON "ecommerce_webhook_events" USING btree ("processed");--> statement-breakpoint
CREATE INDEX "browse_abandonment_fires_org_contact_idx" ON "browse_abandonment_fires" USING btree ("org_id","contact_id");--> statement-breakpoint
CREATE INDEX "browse_abandonment_fires_fired_at_idx" ON "browse_abandonment_fires" USING btree ("fired_at");--> statement-breakpoint
CREATE UNIQUE INDEX "product_page_views_contact_sku_uq" ON "product_page_views" USING btree ("org_id","contact_id","sku");--> statement-breakpoint
CREATE INDEX "product_page_views_org_idx" ON "product_page_views" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "product_page_views_contact_idx" ON "product_page_views" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "product_page_views_last_viewed_idx" ON "product_page_views" USING btree ("last_viewed_at");--> statement-breakpoint
CREATE INDEX "product_page_views_visitor_idx" ON "product_page_views" USING btree ("visitor_token");--> statement-breakpoint
CREATE INDEX "inbound_emails_org_idx" ON "inbound_emails" USING btree ("org_id","received_at");--> statement-breakpoint
CREATE INDEX "inbound_emails_contact_idx" ON "inbound_emails" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "inbound_emails_msg_id_idx" ON "inbound_emails" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "sso_login_states_expires_idx" ON "sso_login_states" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "access_reviews_org_idx" ON "access_reviews" USING btree ("org_id","reviewed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "compliance_controls_org_control_idx" ON "compliance_controls" USING btree ("org_id","control_id");--> statement-breakpoint
CREATE UNIQUE INDEX "retention_policies_org_resource_idx" ON "data_retention_policies" USING btree ("org_id","resource");--> statement-breakpoint
CREATE INDEX "audit_logs_org_idx" ON "audit_logs" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "audit_logs_user_idx" ON "audit_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_logs_org_created_idx" ON "audit_logs" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_resource_idx" ON "audit_logs" USING btree ("org_id","resource");--> statement-breakpoint
CREATE INDEX "billing_subscriptions_customer_idx" ON "billing_subscriptions" USING btree ("stripe_customer_id");--> statement-breakpoint
CREATE INDEX "accounts_org_idx" ON "accounts" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "accounts_parent_idx" ON "accounts" USING btree ("parent_account_id");--> statement-breakpoint
CREATE INDEX "accounts_owner_idx" ON "accounts" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "pipelines_org_idx" ON "pipelines" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "deal_stage_history_deal_idx" ON "deal_stage_history" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX "deal_stage_history_org_idx" ON "deal_stage_history" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "deals_org_idx" ON "deals" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "deals_pipeline_idx" ON "deals" USING btree ("pipeline_id");--> statement-breakpoint
CREATE INDEX "deals_contact_idx" ON "deals" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "deals_account_idx" ON "deals" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "deals_owner_idx" ON "deals" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "deals_team_idx" ON "deals" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "deals_org_status_idx" ON "deals" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "deals_stage_idx" ON "deals" USING btree ("pipeline_id","stage_id");--> statement-breakpoint
CREATE UNIQUE INDEX "custom_object_defs_org_key_idx" ON "custom_object_definitions" USING btree ("org_id","key");--> statement-breakpoint
CREATE INDEX "custom_object_records_org_idx" ON "custom_object_records" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "custom_object_records_def_idx" ON "custom_object_records" USING btree ("object_def_id");--> statement-breakpoint
CREATE UNIQUE INDEX "custom_object_records_external_idx" ON "custom_object_records" USING btree ("org_id","object_key","external_id");--> statement-breakpoint
CREATE INDEX "custom_object_rel_record_idx" ON "custom_object_relations" USING btree ("record_id");--> statement-breakpoint
CREATE INDEX "custom_object_rel_entity_idx" ON "custom_object_relations" USING btree ("org_id","entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sf_idmap_local_idx" ON "salesforce_id_map" USING btree ("org_id","entity_type","local_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sf_idmap_sfdc_idx" ON "salesforce_id_map" USING btree ("org_id","entity_type","salesforce_id");--> statement-breakpoint
CREATE INDEX "sf_sync_runs_org_idx" ON "salesforce_sync_runs" USING btree ("org_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "raynet_company_map_account_uq" ON "raynet_company_map" USING btree ("org_id","account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "raynet_company_map_remote_uq" ON "raynet_company_map" USING btree ("org_id","raynet_company_id");--> statement-breakpoint
CREATE INDEX "raynet_company_map_org_idx" ON "raynet_company_map" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "raynet_connections_org_uq" ON "raynet_connections" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "raynet_connections_instance_idx" ON "raynet_connections" USING btree ("instance_name");--> statement-breakpoint
CREATE UNIQUE INDEX "raynet_contact_map_contact_uq" ON "raynet_contact_map" USING btree ("org_id","contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "raynet_contact_map_remote_uq" ON "raynet_contact_map" USING btree ("org_id","raynet_contact_id");--> statement-breakpoint
CREATE INDEX "raynet_contact_map_org_idx" ON "raynet_contact_map" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "raynet_deal_map_deal_uq" ON "raynet_deal_map" USING btree ("org_id","deal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "raynet_deal_map_remote_uq" ON "raynet_deal_map" USING btree ("org_id","raynet_business_case_id");--> statement-breakpoint
CREATE INDEX "raynet_deal_map_org_idx" ON "raynet_deal_map" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "app_studio_actions_app_key_idx" ON "app_studio_actions" USING btree ("app_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "app_studio_apps_org_slug_idx" ON "app_studio_apps" USING btree ("org_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "app_studio_triggers_app_key_idx" ON "app_studio_triggers" USING btree ("app_id","key");--> statement-breakpoint
CREATE INDEX "app_studio_subs_app_idx" ON "app_studio_webhook_subscribers" USING btree ("app_id");--> statement-breakpoint
CREATE INDEX "app_studio_subs_event_idx" ON "app_studio_webhook_subscribers" USING btree ("org_id","event");--> statement-breakpoint
CREATE INDEX "crm_tasks_org_idx" ON "crm_tasks" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "crm_tasks_contact_idx" ON "crm_tasks" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "crm_tasks_deal_idx" ON "crm_tasks" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX "crm_tasks_assigned_idx" ON "crm_tasks" USING btree ("assigned_user_id");--> statement-breakpoint
CREATE INDEX "crm_tasks_due_idx" ON "crm_tasks" USING btree ("due_at");--> statement-breakpoint
CREATE INDEX "crm_tasks_status_idx" ON "crm_tasks" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "crm_notes_org_idx" ON "crm_notes" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "crm_notes_contact_idx" ON "crm_notes" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "crm_notes_deal_idx" ON "crm_notes" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX "crm_notes_account_idx" ON "crm_notes" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "sales_sequences_org_idx" ON "sales_sequences" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "seq_enrollments_org_idx" ON "sequence_enrollments" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "seq_enrollments_contact_idx" ON "sequence_enrollments" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "seq_enrollments_next_step_idx" ON "sequence_enrollments" USING btree ("next_step_at");--> statement-breakpoint
CREATE INDEX "seq_enrollments_sequence_idx" ON "sequence_enrollments" USING btree ("sequence_id");--> statement-breakpoint
CREATE UNIQUE INDEX "seq_enrollments_unique_active_idx" ON "sequence_enrollments" USING btree ("sequence_id","contact_id");--> statement-breakpoint
CREATE INDEX "seq_step_logs_enrollment_idx" ON "sequence_step_logs" USING btree ("enrollment_id");--> statement-breakpoint
CREATE INDEX "seq_step_logs_contact_idx" ON "sequence_step_logs" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "site_events_org_idx" ON "site_events" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "site_events_visitor_idx" ON "site_events" USING btree ("visitor_id");--> statement-breakpoint
CREATE INDEX "site_events_name_idx" ON "site_events" USING btree ("org_id","event_name");--> statement-breakpoint
CREATE INDEX "site_events_contact_idx" ON "site_events" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "site_page_views_org_idx" ON "site_page_views" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "site_page_views_site_idx" ON "site_page_views" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "site_page_views_visitor_idx" ON "site_page_views" USING btree ("visitor_id");--> statement-breakpoint
CREATE INDEX "site_page_views_contact_idx" ON "site_page_views" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "site_page_views_occurred_idx" ON "site_page_views" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "tracked_sites_org_idx" ON "tracked_sites" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tracked_sites_org_domain_idx" ON "tracked_sites" USING btree ("org_id","domain");--> statement-breakpoint
CREATE INDEX "site_msg_imp_message_idx" ON "site_message_impressions" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "site_msg_imp_visitor_idx" ON "site_message_impressions" USING btree ("visitor_id");--> statement-breakpoint
CREATE INDEX "site_messages_org_idx" ON "site_messages" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "site_messages_site_idx" ON "site_messages" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "web_pers_rules_org_idx" ON "web_personalization_rules" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "web_pers_rules_site_idx" ON "web_personalization_rules" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "dmarc_reports_org_domain_idx" ON "dmarc_reports" USING btree ("org_id","domain");--> statement-breakpoint
CREATE INDEX "dmarc_reports_date_end_idx" ON "dmarc_reports" USING btree ("org_id","date_end");--> statement-breakpoint
CREATE UNIQUE INDEX "dmarc_reports_org_reporter_id_idx" ON "dmarc_reports" USING btree ("org_id","reporter_org","report_id");--> statement-breakpoint
CREATE INDEX "loyalty_programs_org_idx" ON "loyalty_programs" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "loyalty_members_org_idx" ON "loyalty_members" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "loyalty_members_program_idx" ON "loyalty_members" USING btree ("program_id");--> statement-breakpoint
CREATE INDEX "loyalty_members_contact_idx" ON "loyalty_members" USING btree ("contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "loyalty_members_program_contact_idx" ON "loyalty_members" USING btree ("program_id","contact_id");--> statement-breakpoint
CREATE INDEX "loyalty_points_member_idx" ON "loyalty_points" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "loyalty_points_org_idx" ON "loyalty_points" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "loyalty_points_created_idx" ON "loyalty_points" USING btree ("member_id","created_at");--> statement-breakpoint
CREATE INDEX "loyalty_redemptions_member_idx" ON "loyalty_redemptions" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "loyalty_redemptions_reward_idx" ON "loyalty_redemptions" USING btree ("reward_id");--> statement-breakpoint
CREATE INDEX "loyalty_rewards_org_program_idx" ON "loyalty_rewards" USING btree ("org_id","program_id");--> statement-breakpoint
CREATE INDEX "loyalty_earning_rules_org_program_idx" ON "loyalty_earning_rules" USING btree ("org_id","program_id");--> statement-breakpoint
CREATE INDEX "loyalty_earning_rules_event_idx" ON "loyalty_earning_rules" USING btree ("program_id","event_type");--> statement-breakpoint
CREATE INDEX "baa_org_idx" ON "business_associate_agreements" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "baa_status_idx" ON "business_associate_agreements" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "hipaa_log_org_idx" ON "hipaa_access_log" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "hipaa_log_created_idx" ON "hipaa_access_log" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "hipaa_log_user_idx" ON "hipaa_access_log" USING btree ("org_id","user_id");--> statement-breakpoint
CREATE INDEX "phi_fields_org_idx" ON "phi_field_flags" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_presence_user_uq" ON "agent_presence" USING btree ("org_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "business_hours_org_uq" ON "business_hours" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "hunt_groups_org_idx" ON "hunt_groups" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "ivr_menus_org_idx" ON "ivr_menus" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ivr_menus_org_did_uq" ON "ivr_menus" USING btree ("org_id","did_number");--> statement-breakpoint
CREATE INDEX "bookings_org_host_idx" ON "bookings" USING btree ("org_id","host_user_id");--> statement-breakpoint
CREATE INDEX "bookings_org_start_idx" ON "bookings" USING btree ("org_id","start_at");--> statement-breakpoint
CREATE UNIQUE INDEX "cal_events_integration_ext_uq" ON "calendar_events" USING btree ("integration_id","external_event_id");--> statement-breakpoint
CREATE INDEX "cal_events_integration_start_idx" ON "calendar_events" USING btree ("integration_id","start_at");--> statement-breakpoint
CREATE INDEX "cal_events_org_start_idx" ON "calendar_events" USING btree ("org_id","start_at");--> statement-breakpoint
CREATE UNIQUE INDEX "cal_int_user_provider_acct_uq" ON "calendar_integrations" USING btree ("user_id","provider","external_account_id");--> statement-breakpoint
CREATE INDEX "cal_int_org_idx" ON "calendar_integrations" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "identity_merges_org_idx" ON "identity_merges" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "identity_merges_winner_idx" ON "identity_merges" USING btree ("winner_contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "identity_signals_org_type_value_uq" ON "identity_signals" USING btree ("org_id","signal_type","signal_value");--> statement-breakpoint
CREATE INDEX "identity_signals_contact_idx" ON "identity_signals" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "identity_signals_last_seen_idx" ON "identity_signals" USING btree ("last_seen_at");--> statement-breakpoint
CREATE INDEX "activation_destinations_org_idx" ON "activation_destinations" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "activation_runs_org_idx" ON "activation_runs" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "activation_runs_dest_idx" ON "activation_runs" USING btree ("destination_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cdp_events_org_event_id_uq" ON "cdp_events" USING btree ("org_id","event_id") WHERE "cdp_events"."event_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "cdp_events_org_name_idx" ON "cdp_events" USING btree ("org_id","name");--> statement-breakpoint
CREATE INDEX "cdp_events_contact_idx" ON "cdp_events" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "cdp_events_anon_idx" ON "cdp_events" USING btree ("anonymous_id");--> statement-breakpoint
CREATE INDEX "cdp_events_occurred_idx" ON "cdp_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "contact_traits_org_idx" ON "contact_traits" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "contact_traits_computed_idx" ON "contact_traits" USING btree ("computed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "hubspot_connections_org_uq" ON "hubspot_connections" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "hubspot_connections_org_id_idx" ON "hubspot_connections" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "hubspot_contact_map_contact_uq" ON "hubspot_contact_map" USING btree ("org_id","contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "hubspot_contact_map_vid_uq" ON "hubspot_contact_map" USING btree ("org_id","hubspot_vid");--> statement-breakpoint
CREATE INDEX "hubspot_contact_map_org_idx" ON "hubspot_contact_map" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "hubspot_deal_map_deal_uq" ON "hubspot_deal_map" USING btree ("org_id","deal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "hubspot_deal_map_hs_deal_uq" ON "hubspot_deal_map" USING btree ("org_id","hubspot_deal_id");--> statement-breakpoint
CREATE INDEX "hubspot_deal_map_org_idx" ON "hubspot_deal_map" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "calendly_connections_org_uq" ON "calendly_connections" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "calendly_connections_org_id_idx" ON "calendly_connections" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_availability_user_uq" ON "agent_availability" USING btree ("org_id","user_id");--> statement-breakpoint
CREATE INDEX "agent_availability_org_status_idx" ON "agent_availability" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "chat_routing_rules_org_idx" ON "chat_routing_rules" USING btree ("org_id","priority");--> statement-breakpoint
CREATE INDEX "ticket_assignments_ticket_idx" ON "ticket_assignments" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "ticket_assignments_org_agent_idx" ON "ticket_assignments" USING btree ("org_id","assigned_to");--> statement-breakpoint
CREATE INDEX "phone_port_requests_org_idx" ON "phone_number_port_requests" USING btree ("org_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "phone_numbers_number_uq" ON "phone_numbers" USING btree ("org_id","number");--> statement-breakpoint
CREATE INDEX "phone_numbers_org_idx" ON "phone_numbers" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "phone_numbers_user_idx" ON "phone_numbers" USING btree ("assigned_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "booking_availability_user_uq" ON "booking_availability" USING btree ("org_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "booking_pages_slug_uq" ON "booking_pages" USING btree ("org_id","slug");--> statement-breakpoint
CREATE INDEX "booking_pages_user_idx" ON "booking_pages" USING btree ("owner_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "event_types_owner_slug_uq" ON "event_types" USING btree ("owner_user_id","slug");--> statement-breakpoint
CREATE INDEX "event_types_org_idx" ON "event_types" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "round_robin_state_event_user_uq" ON "round_robin_state" USING btree ("event_type_id","user_id");--> statement-breakpoint
CREATE INDEX "round_robin_state_org_idx" ON "round_robin_state" USING btree ("org_id","event_type_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cdp_sources_org_name_uq" ON "cdp_sources" USING btree ("org_id","name");--> statement-breakpoint
CREATE INDEX "cdp_sources_org_kind_idx" ON "cdp_sources" USING btree ("org_id","kind");--> statement-breakpoint
CREATE INDEX "cdp_sources_status_idx" ON "cdp_sources" USING btree ("status");--> statement-breakpoint
CREATE INDEX "cdp_sync_runs_source_idx" ON "cdp_sync_runs" USING btree ("source_id","started_at");--> statement-breakpoint
CREATE INDEX "cdp_sync_runs_org_idx" ON "cdp_sync_runs" USING btree ("org_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "org_members_org_email_uq" ON "organization_members" USING btree ("org_id","email");--> statement-breakpoint
CREATE INDEX "org_members_user_idx" ON "organization_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "org_members_org_status_idx" ON "organization_members" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "org_members_token_idx" ON "organization_members" USING btree ("invitation_token");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_balances_org_uq" ON "credit_balances" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "credit_tx_org_idx" ON "credit_transactions" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "credit_tx_ref_idx" ON "credit_transactions" USING btree ("reference_id");--> statement-breakpoint
CREATE INDEX "meter_events_org_product_idx" ON "product_meter_events" USING btree ("org_id","product","created_at");--> statement-breakpoint
CREATE INDEX "meter_events_ref_idx" ON "product_meter_events" USING btree ("reference_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_meters_org_product_period_uq" ON "product_usage_meters" USING btree ("org_id","product","period");--> statement-breakpoint
CREATE INDEX "product_meters_org_period_idx" ON "product_usage_meters" USING btree ("org_id","period");--> statement-breakpoint
CREATE INDEX "seo_audit_results_org_url_idx" ON "seo_audit_results" USING btree ("org_id","url");--> statement-breakpoint
CREATE INDEX "seo_audit_results_org_date_idx" ON "seo_audit_results" USING btree ("org_id","audited_at");--> statement-breakpoint
CREATE INDEX "seo_cluster_pages_cluster_idx" ON "seo_cluster_pages" USING btree ("cluster_id");--> statement-breakpoint
CREATE INDEX "seo_cluster_pages_org_type_idx" ON "seo_cluster_pages" USING btree ("org_id","page_type");--> statement-breakpoint
CREATE UNIQUE INDEX "seo_keywords_org_kw_uq" ON "seo_keywords" USING btree ("org_id","keyword","language","country");--> statement-breakpoint
CREATE INDEX "seo_keywords_org_volume_idx" ON "seo_keywords" USING btree ("org_id","search_volume");--> statement-breakpoint
CREATE UNIQUE INDEX "seo_rank_snapshots_uq" ON "seo_rank_snapshots" USING btree ("tracking_id","date");--> statement-breakpoint
CREATE INDEX "seo_rank_snapshots_org_date_idx" ON "seo_rank_snapshots" USING btree ("org_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "seo_rank_tracking_uq" ON "seo_rank_tracking" USING btree ("org_id","keyword","url","country");--> statement-breakpoint
CREATE INDEX "seo_rank_tracking_active_idx" ON "seo_rank_tracking" USING btree ("org_id","active");--> statement-breakpoint
CREATE INDEX "seo_clusters_org_idx" ON "seo_topic_clusters" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "social_accounts_org_platform_uq" ON "social_accounts" USING btree ("org_id","platform","platform_user_id");--> statement-breakpoint
CREATE INDEX "social_accounts_org_active_idx" ON "social_accounts" USING btree ("org_id","active");--> statement-breakpoint
CREATE UNIQUE INDEX "social_oauth_states_state_uq" ON "social_oauth_states" USING btree ("state");--> statement-breakpoint
CREATE INDEX "social_oauth_states_exp_idx" ON "social_oauth_states" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "social_analytics_account_date_idx" ON "social_analytics_snapshots" USING btree ("account_id","date");--> statement-breakpoint
CREATE INDEX "social_analytics_org_date_idx" ON "social_analytics_snapshots" USING btree ("org_id","date");--> statement-breakpoint
CREATE INDEX "social_mentions_uq_idx" ON "social_mentions" USING btree ("org_id","platform","platform_mention_id");--> statement-breakpoint
CREATE INDEX "social_mentions_org_status_idx" ON "social_mentions" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "social_mentions_org_date_idx" ON "social_mentions" USING btree ("org_id","mentioned_at");--> statement-breakpoint
CREATE INDEX "social_monitoring_kw_org_idx" ON "social_monitoring_keywords" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "social_posts_org_status_idx" ON "social_posts" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "social_posts_org_schedule_idx" ON "social_posts" USING btree ("org_id","scheduled_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ad_accounts_org_platform_uq" ON "ad_accounts" USING btree ("org_id","platform","platform_account_id");--> statement-breakpoint
CREATE INDEX "ad_accounts_org_active_idx" ON "ad_accounts" USING btree ("org_id","active");--> statement-breakpoint
CREATE INDEX "ad_audience_syncs_org_idx" ON "ad_audience_syncs" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "ad_audience_syncs_account_idx" ON "ad_audience_syncs" USING btree ("ad_account_id");--> statement-breakpoint
CREATE INDEX "ad_perf_org_date_idx" ON "ad_performance_snapshots" USING btree ("org_id","date");--> statement-breakpoint
CREATE INDEX "ad_perf_account_date_idx" ON "ad_performance_snapshots" USING btree ("ad_account_id","date");--> statement-breakpoint
CREATE INDEX "quotes_org_idx" ON "quotes" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "quotes_deal_idx" ON "quotes" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX "quotes_token_idx" ON "quotes" USING btree ("signature_token");--> statement-breakpoint
CREATE INDEX "invoices_org_idx" ON "invoices" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "invoices_deal_idx" ON "invoices" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX "invoices_org_status_idx" ON "invoices" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "invoices_due_date_idx" ON "invoices" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "invoices_stripe_pi_idx" ON "invoices" USING btree ("stripe_payment_intent_id");--> statement-breakpoint
CREATE INDEX "subscription_changes_sub_idx" ON "subscription_changes" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "subscription_changes_org_idx" ON "subscription_changes" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "subscriptions_org_idx" ON "subscriptions" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "subscriptions_contact_idx" ON "subscriptions" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "subscriptions_org_status_idx" ON "subscriptions" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "subscriptions_next_invoice_idx" ON "subscriptions" USING btree ("next_invoice_at");--> statement-breakpoint
CREATE INDEX "subscriptions_stripe_idx" ON "subscriptions" USING btree ("stripe_subscription_id");--> statement-breakpoint
CREATE INDEX "lifecycle_rules_org_idx" ON "lifecycle_rules" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "lifecycle_rules_enabled_idx" ON "lifecycle_rules" USING btree ("org_id","enabled");--> statement-breakpoint
CREATE UNIQUE INDEX "associations_pair_uq" ON "associations" USING btree ("org_id","from_type","from_id","to_type","to_id","label");--> statement-breakpoint
CREATE INDEX "associations_from_idx" ON "associations" USING btree ("org_id","from_type","from_id");--> statement-breakpoint
CREATE INDEX "associations_to_idx" ON "associations" USING btree ("org_id","to_type","to_id");--> statement-breakpoint
CREATE INDEX "video_messages_org_idx" ON "video_messages" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "video_messages_user_idx" ON "video_messages" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "video_messages_contact_idx" ON "video_messages" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "video_messages_token_idx" ON "video_messages" USING btree ("share_token");--> statement-breakpoint
CREATE INDEX "video_messages_status_idx" ON "video_messages" USING btree ("status");--> statement-breakpoint
CREATE INDEX "video_play_events_video_idx" ON "video_play_events" USING btree ("video_id");--> statement-breakpoint
CREATE INDEX "video_play_events_org_idx" ON "video_play_events" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "video_play_events_created_idx" ON "video_play_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "kb_chunks_org_idx" ON "kb_chunks" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "kb_chunks_doc_idx" ON "kb_chunks" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "kb_documents_org_idx" ON "kb_documents" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "kb_documents_source_idx" ON "kb_documents" USING btree ("org_id","source_type","source_id");--> statement-breakpoint
CREATE INDEX "kb_documents_ref_idx" ON "kb_documents" USING btree ("org_id","external_ref");--> statement-breakpoint
CREATE INDEX "kb_documents_status_idx" ON "kb_documents" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "org_sandboxes_sandbox_uniq" ON "org_sandboxes" USING btree ("sandbox_org_id");--> statement-breakpoint
CREATE INDEX "org_sandboxes_parent_idx" ON "org_sandboxes" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "team_members_team_user_uq" ON "team_members" USING btree ("team_id","user_id");--> statement-breakpoint
CREATE INDEX "team_members_user_idx" ON "team_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "team_members_org_user_idx" ON "team_members" USING btree ("org_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "teams_org_slug_uq" ON "teams" USING btree ("org_id","slug");--> statement-breakpoint
CREATE INDEX "teams_org_idx" ON "teams" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "field_permissions_org_role_entity_uq" ON "field_permissions" USING btree ("org_id","role","entity");--> statement-breakpoint
CREATE INDEX "field_permissions_org_idx" ON "field_permissions" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "custom_channels_org_slug_uq" ON "custom_channels" USING btree ("org_id","slug");--> statement-breakpoint
CREATE INDEX "custom_channels_org_idx" ON "custom_channels" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "calc_props_org_entity_key_uq" ON "calculated_properties" USING btree ("org_id","entity","key");--> statement-breakpoint
CREATE INDEX "calc_props_org_idx" ON "calculated_properties" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "calc_prop_values_prop_entity_uq" ON "calculated_property_values" USING btree ("prop_id","entity_id");--> statement-breakpoint
CREATE INDEX "calc_prop_values_org_idx" ON "calculated_property_values" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "data_sync_conflicts_org_idx" ON "data_sync_conflicts" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "data_sync_conflicts_pair_idx" ON "data_sync_conflicts" USING btree ("pair_id");--> statement-breakpoint
CREATE INDEX "data_sync_conflicts_unresolved_idx" ON "data_sync_conflicts" USING btree ("org_id","resolved");--> statement-breakpoint
CREATE UNIQUE INDEX "data_sync_mappings_org_provider_entity_uq" ON "data_sync_mappings" USING btree ("org_id","provider","entity");--> statement-breakpoint
CREATE INDEX "data_sync_mappings_org_idx" ON "data_sync_mappings" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "data_sync_pairs_provider_entity_local_uq" ON "data_sync_pairs" USING btree ("provider","entity","local_id");--> statement-breakpoint
CREATE UNIQUE INDEX "data_sync_pairs_provider_entity_remote_uq" ON "data_sync_pairs" USING btree ("provider","entity","remote_id");--> statement-breakpoint
CREATE INDEX "data_sync_pairs_org_idx" ON "data_sync_pairs" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "data_pipeline_runs_pipeline_idx" ON "data_pipeline_runs" USING btree ("pipeline_id");--> statement-breakpoint
CREATE INDEX "data_pipeline_runs_org_idx" ON "data_pipeline_runs" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "data_pipelines_org_name_uq" ON "data_pipelines" USING btree ("org_id","name");--> statement-breakpoint
CREATE INDEX "data_pipelines_org_idx" ON "data_pipelines" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "data_pipelines_status_idx" ON "data_pipelines" USING btree ("status");--> statement-breakpoint
CREATE INDEX "contact_gdpr_consents_contact_purpose_idx" ON "contact_gdpr_consents" USING btree ("contact_id","purpose_id");--> statement-breakpoint
CREATE INDEX "contact_gdpr_consents_org_purpose_idx" ON "contact_gdpr_consents" USING btree ("org_id","purpose_id");--> statement-breakpoint
CREATE INDEX "contact_gdpr_consents_expires_idx" ON "contact_gdpr_consents" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "processing_purposes_org_idx" ON "processing_purposes" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "wheel_spins_form_email_idx" ON "wheel_spins" USING btree ("form_id","email");--> statement-breakpoint
CREATE INDEX "wheel_spins_org_form_idx" ON "wheel_spins" USING btree ("org_id","form_id");--> statement-breakpoint
CREATE INDEX "wheel_spins_contact_idx" ON "wheel_spins" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "inbox_messages_org_channel_idx" ON "inbox_messages" USING btree ("org_id","channel");--> statement-breakpoint
CREATE INDEX "inbox_messages_thread_idx" ON "inbox_messages" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "inbox_messages_provider_msg_idx" ON "inbox_messages" USING btree ("provider_message_id");--> statement-breakpoint
CREATE INDEX "inbox_messages_contact_idx" ON "inbox_messages" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "inbox_messages_org_received_idx" ON "inbox_messages" USING btree ("org_id","received_at");--> statement-breakpoint
CREATE INDEX "meta_page_mappings_org_id_idx" ON "meta_page_mappings" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "social_contact_identifiers_contact_idx" ON "social_contact_identifiers" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "social_contact_identifiers_org_platform_idx" ON "social_contact_identifiers" USING btree ("org_id","platform");--> statement-breakpoint
CREATE INDEX "digital_asset_deliveries_asset_contact_idx" ON "digital_asset_deliveries" USING btree ("asset_id","contact_id");--> statement-breakpoint
CREATE INDEX "digital_asset_deliveries_org_idx" ON "digital_asset_deliveries" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "digital_assets_org_id_idx" ON "digital_assets" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "license_keys_asset_contact_idx" ON "license_keys" USING btree ("asset_id","contact_id");--> statement-breakpoint
CREATE INDEX "license_keys_org_idx" ON "license_keys" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "canned_responses_org_idx" ON "canned_responses" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "canned_responses_shortcut_idx" ON "canned_responses" USING btree ("org_id","shortcut");--> statement-breakpoint
CREATE INDEX "external_feeds_org_idx" ON "external_feeds" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "external_feeds_next_run_idx" ON "external_feeds" USING btree ("next_run_at","active");--> statement-breakpoint
CREATE UNIQUE INDEX "ab_holdbacks_campaign_contact_uidx" ON "ab_test_holdbacks" USING btree ("campaign_id","contact_id");--> statement-breakpoint
CREATE INDEX "ab_holdbacks_campaign_idx" ON "ab_test_holdbacks" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "ab_holdbacks_org_idx" ON "ab_test_holdbacks" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ab_results_campaign_uidx" ON "ab_test_results" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "ab_results_org_idx" ON "ab_test_results" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "newsletter_subs_contact_tier_uidx" ON "newsletter_subscriptions" USING btree ("contact_id","tier_id");--> statement-breakpoint
CREATE INDEX "newsletter_subs_org_idx" ON "newsletter_subscriptions" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "newsletter_subs_contact_idx" ON "newsletter_subscriptions" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "newsletter_subs_tier_idx" ON "newsletter_subscriptions" USING btree ("tier_id");--> statement-breakpoint
CREATE INDEX "newsletter_subs_status_idx" ON "newsletter_subscriptions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "newsletter_subs_stripe_idx" ON "newsletter_subscriptions" USING btree ("stripe_subscription_id");--> statement-breakpoint
CREATE INDEX "newsletter_tiers_org_idx" ON "newsletter_tiers" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "newsletter_tiers_org_active_idx" ON "newsletter_tiers" USING btree ("org_id","is_active");--> statement-breakpoint
CREATE INDEX "referral_events_referral_idx" ON "newsletter_referral_events" USING btree ("referral_id");--> statement-breakpoint
CREATE INDEX "referral_events_org_idx" ON "newsletter_referral_events" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "referral_events_type_idx" ON "newsletter_referral_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "referral_programs_org_idx" ON "newsletter_referral_programs" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "newsletter_referrals_code_uidx" ON "newsletter_referrals" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "newsletter_referrals_referrer_prog_uidx" ON "newsletter_referrals" USING btree ("referrer_contact_id","program_id");--> statement-breakpoint
CREATE INDEX "newsletter_referrals_org_idx" ON "newsletter_referrals" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "newsletter_referrals_program_idx" ON "newsletter_referrals" USING btree ("program_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bimi_configs_org_domain_uidx" ON "bimi_configs" USING btree ("org_id","domain");--> statement-breakpoint
CREATE INDEX "bimi_configs_org_idx" ON "bimi_configs" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "playbook_runs_org_idx" ON "playbook_runs" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "playbook_runs_playbook_idx" ON "playbook_runs" USING btree ("playbook_id");--> statement-breakpoint
CREATE INDEX "playbook_runs_contact_idx" ON "playbook_runs" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "playbook_runs_deal_idx" ON "playbook_runs" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX "playbooks_org_idx" ON "playbooks" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "rotation_logs_config_idx" ON "rotation_assignment_logs" USING btree ("config_id");--> statement-breakpoint
CREATE INDEX "rotation_logs_entity_idx" ON "rotation_assignment_logs" USING btree ("org_id","entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rotation_configs_org_type_uq" ON "rotation_configs" USING btree ("org_id","entity_type","pipeline_id");--> statement-breakpoint
CREATE INDEX "rotation_configs_org_idx" ON "rotation_configs" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "quote_templates_org_idx" ON "quote_templates" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "intent_scores_org_idx" ON "intent_scores" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "intent_scores_contact_idx" ON "intent_scores" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "intent_scores_domain_idx" ON "intent_scores" USING btree ("org_id","account_domain");--> statement-breakpoint
CREATE INDEX "intent_signals_org_idx" ON "intent_signals" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "intent_signals_contact_idx" ON "intent_signals" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "intent_signals_domain_idx" ON "intent_signals" USING btree ("org_id","account_domain");--> statement-breakpoint
CREATE INDEX "intent_signals_type_idx" ON "intent_signals" USING btree ("org_id","signal_type");--> statement-breakpoint
CREATE INDEX "intent_signals_detected_idx" ON "intent_signals" USING btree ("org_id","detected_at");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_ext_cards_app_key_uq" ON "crm_extension_cards" USING btree ("app_id","key");--> statement-breakpoint
CREATE INDEX "crm_ext_cards_org_idx" ON "crm_extension_cards" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "crm_ext_cards_app_idx" ON "crm_extension_cards" USING btree ("app_id");--> statement-breakpoint
CREATE INDEX "brand_voice_org_idx" ON "brand_voice_profiles" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "brand_voice_org_active_idx" ON "brand_voice_profiles" USING btree ("org_id","active");--> statement-breakpoint
CREATE INDEX "nba_scores_contact_idx" ON "nba_scores" USING btree ("org_id","contact_id");--> statement-breakpoint
CREATE INDEX "nba_scores_expires_idx" ON "nba_scores" USING btree ("org_id","expires_at");--> statement-breakpoint
CREATE INDEX "ad_slots_org_idx" ON "newsletter_ad_slots" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "newsletter_ads_org_idx" ON "newsletter_ads" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "newsletter_ads_slot_idx" ON "newsletter_ads" USING btree ("slot_id");--> statement-breakpoint
CREATE INDEX "newsletter_ads_status_idx" ON "newsletter_ads" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "contact_personas_org_contact_idx" ON "contact_personas" USING btree ("org_id","contact_id");--> statement-breakpoint
CREATE INDEX "contact_personas_persona_idx" ON "contact_personas" USING btree ("org_id","persona");--> statement-breakpoint
CREATE INDEX "zp_forms_org_idx" ON "zp_collection_forms" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "zp_forms_token_idx" ON "zp_collection_forms" USING btree ("embed_token");--> statement-breakpoint
CREATE INDEX "zp_contact_data_contact_idx" ON "zp_contact_data" USING btree ("org_id","contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "zp_contact_data_key_idx" ON "zp_contact_data" USING btree ("org_id","contact_id","key");--> statement-breakpoint
CREATE INDEX "consent_events_contact_idx" ON "consent_events" USING btree ("org_id","contact_id");--> statement-breakpoint
CREATE INDEX "consent_events_type_idx" ON "consent_events" USING btree ("org_id","event_type");--> statement-breakpoint
CREATE INDEX "consent_events_occurred_idx" ON "consent_events" USING btree ("org_id","occurred_at");--> statement-breakpoint
CREATE INDEX "co_marketing_initiator_idx" ON "co_marketing_campaigns" USING btree ("initiator_org_id");--> statement-breakpoint
CREATE INDEX "co_marketing_partner_idx" ON "co_marketing_campaigns" USING btree ("partner_org_id");--> statement-breakpoint
CREATE INDEX "co_marketing_status_idx" ON "co_marketing_campaigns" USING btree ("status");--> statement-breakpoint
CREATE INDEX "dynamic_content_org_idx" ON "dynamic_content_blocks" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "dynamic_content_placeholder_idx" ON "dynamic_content_blocks" USING btree ("org_id","placeholder_tag");--> statement-breakpoint
CREATE INDEX "competitor_emails_watchlist_idx" ON "competitor_emails" USING btree ("watchlist_id");--> statement-breakpoint
CREATE INDEX "competitor_emails_org_idx" ON "competitor_emails" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "competitor_emails_received_idx" ON "competitor_emails" USING btree ("org_id","received_at");--> statement-breakpoint
CREATE INDEX "competitor_watchlist_org_idx" ON "competitor_watchlist" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "competitor_watchlist_email_idx" ON "competitor_watchlist" USING btree ("monitor_email");--> statement-breakpoint
CREATE UNIQUE INDEX "newsletter_sub_org_contact_idx" ON "newsletter_paid_subscriptions" USING btree ("org_id","contact_id","plan_id");--> statement-breakpoint
CREATE INDEX "newsletter_sub_org_idx" ON "newsletter_paid_subscriptions" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "newsletter_plans_org_idx" ON "newsletter_plans" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "brand_guidelines_org_idx" ON "brand_guidelines" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "inbox_placement_org_idx" ON "inbox_placement_tests" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "inbox_placement_campaign_idx" ON "inbox_placement_tests" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "organizations_parent_idx" ON "organizations" USING btree ("parent_org_id");--> statement-breakpoint
CREATE INDEX "organizations_sandbox_parent_idx" ON "organizations" USING btree ("sandbox_of_org_id");--> statement-breakpoint
CREATE INDEX "contacts_lifecycle_stage_idx" ON "contacts" USING btree ("org_id","lifecycle_stage");--> statement-breakpoint
CREATE INDEX "templates_locale_idx" ON "templates" USING btree ("org_id","locale");--> statement-breakpoint
CREATE INDEX "templates_tgroup_idx" ON "templates" USING btree ("translation_group_id");--> statement-breakpoint
CREATE INDEX "email_events_ab_variant_idx" ON "email_events" USING btree ("campaign_id","ab_variant_id");