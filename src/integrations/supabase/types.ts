export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          metadata: Json
          organization_id: string | null
          resource_id: string | null
          resource_type: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          metadata?: Json
          organization_id?: string | null
          resource_id?: string | null
          resource_type?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          metadata?: Json
          organization_id?: string | null
          resource_id?: string | null
          resource_type?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_contacts: {
        Row: {
          campaign_id: string
          contact_id: string
          created_at: string
          eligibility_status: string
          id: string
          organization_id: string
        }
        Insert: {
          campaign_id: string
          contact_id: string
          created_at?: string
          eligibility_status?: string
          id?: string
          organization_id: string
        }
        Update: {
          campaign_id?: string
          contact_id?: string
          created_at?: string
          eligibility_status?: string
          id?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_contacts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_contacts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_contacts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_senders: {
        Row: {
          campaign_id: string
          created_at: string
          id: string
          organization_id: string
          weight: number | null
          whatsapp_account_id: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          id?: string
          organization_id: string
          weight?: number | null
          whatsapp_account_id: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          id?: string
          organization_id?: string
          weight?: number | null
          whatsapp_account_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_senders_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_senders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_senders_whatsapp_account_id_fkey"
            columns: ["whatsapp_account_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          distribution_mode: string
          id: string
          name: string
          organization_id: string
          scheduled_at: string | null
          sending_window_end: string | null
          sending_window_start: string | null
          status: string
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          distribution_mode?: string
          id?: string
          name: string
          organization_id: string
          scheduled_at?: string | null
          sending_window_end?: string | null
          sending_window_start?: string | null
          status?: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          distribution_mode?: string
          id?: string
          name?: string
          organization_id?: string
          scheduled_at?: string | null
          sending_window_end?: string | null
          sending_window_start?: string | null
          status?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_consents: {
        Row: {
          channel: string
          consented_at: string | null
          contact_id: string
          created_at: string
          id: string
          organization_id: string
          proof: string | null
          revoked_at: string | null
          source: string | null
          status: string
        }
        Insert: {
          channel?: string
          consented_at?: string | null
          contact_id: string
          created_at?: string
          id?: string
          organization_id: string
          proof?: string | null
          revoked_at?: string | null
          source?: string | null
          status: string
        }
        Update: {
          channel?: string
          consented_at?: string | null
          contact_id?: string
          created_at?: string
          id?: string
          organization_id?: string
          proof?: string | null
          revoked_at?: string | null
          source?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_consents_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_consents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_list_members: {
        Row: {
          contact_id: string
          created_at: string
          id: string
          list_id: string
          organization_id: string
        }
        Insert: {
          contact_id: string
          created_at?: string
          id?: string
          list_id: string
          organization_id: string
        }
        Update: {
          contact_id?: string
          created_at?: string
          id?: string
          list_id?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_list_members_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_list_members_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "contact_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_list_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_lists: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_lists_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          archived_at: string | null
          consent_at: string | null
          consent_proof: string | null
          consent_source: string | null
          consent_status: string
          created_at: string
          email: string | null
          id: string
          name: string | null
          opt_out_at: string | null
          organization_id: string
          phone_e164: string
          phone_original: string
          source: string | null
          tags: string[]
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          consent_at?: string | null
          consent_proof?: string | null
          consent_source?: string | null
          consent_status?: string
          created_at?: string
          email?: string | null
          id?: string
          name?: string | null
          opt_out_at?: string | null
          organization_id: string
          phone_e164: string
          phone_original: string
          source?: string | null
          tags?: string[]
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          consent_at?: string | null
          consent_proof?: string | null
          consent_source?: string | null
          consent_status?: string
          created_at?: string
          email?: string | null
          id?: string
          name?: string | null
          opt_out_at?: string | null
          organization_id?: string
          phone_e164?: string
          phone_original?: string
          source?: string | null
          tags?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          assigned_to: string | null
          contact_id: string
          created_at: string
          id: string
          last_message_at: string | null
          organization_id: string
          status: string
          updated_at: string
          whatsapp_account_id: string | null
        }
        Insert: {
          assigned_to?: string | null
          contact_id: string
          created_at?: string
          id?: string
          last_message_at?: string | null
          organization_id: string
          status?: string
          updated_at?: string
          whatsapp_account_id?: string | null
        }
        Update: {
          assigned_to?: string | null
          contact_id?: string
          created_at?: string
          id?: string
          last_message_at?: string | null
          organization_id?: string
          status?: string
          updated_at?: string
          whatsapp_account_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_whatsapp_account_id_fkey"
            columns: ["whatsapp_account_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      inbound_messages: {
        Row: {
          body: string | null
          contact_id: string
          conversation_id: string | null
          id: string
          message_type: string | null
          organization_id: string
          payload: Json
          provider_message_id: string | null
          received_at: string
          whatsapp_account_id: string | null
        }
        Insert: {
          body?: string | null
          contact_id: string
          conversation_id?: string | null
          id?: string
          message_type?: string | null
          organization_id: string
          payload?: Json
          provider_message_id?: string | null
          received_at?: string
          whatsapp_account_id?: string | null
        }
        Update: {
          body?: string | null
          contact_id?: string
          conversation_id?: string | null
          id?: string
          message_type?: string | null
          organization_id?: string
          payload?: Json
          provider_message_id?: string | null
          received_at?: string
          whatsapp_account_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inbound_messages_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbound_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbound_messages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbound_messages_whatsapp_account_id_fkey"
            columns: ["whatsapp_account_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      message_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          message_job_id: string | null
          organization_id: string
          payload: Json
          provider_event_id: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          message_job_id?: string | null
          organization_id: string
          payload?: Json
          provider_event_id?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          message_job_id?: string | null
          organization_id?: string
          payload?: Json
          provider_event_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_events_message_job_id_fkey"
            columns: ["message_job_id"]
            isOneToOne: false
            referencedRelation: "message_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      message_jobs: {
        Row: {
          attempts: number
          campaign_id: string | null
          cancelled_at: string | null
          contact_id: string
          created_at: string
          delivered_at: string | null
          error_code: string | null
          error_message: string | null
          failed_at: string | null
          id: string
          idempotency_key: string | null
          locked_at: string | null
          max_attempts: number
          organization_id: string
          priority: number
          processing_started_at: string | null
          provider_message_id: string | null
          provider_status: string | null
          read_at: string | null
          scheduled_at: string | null
          sender_id: string | null
          sent_at: string | null
          status: string
          template_id: string | null
          updated_at: string
          worker_id: string | null
        }
        Insert: {
          attempts?: number
          campaign_id?: string | null
          cancelled_at?: string | null
          contact_id: string
          created_at?: string
          delivered_at?: string | null
          error_code?: string | null
          error_message?: string | null
          failed_at?: string | null
          id?: string
          idempotency_key?: string | null
          locked_at?: string | null
          max_attempts?: number
          organization_id: string
          priority?: number
          processing_started_at?: string | null
          provider_message_id?: string | null
          provider_status?: string | null
          read_at?: string | null
          scheduled_at?: string | null
          sender_id?: string | null
          sent_at?: string | null
          status?: string
          template_id?: string | null
          updated_at?: string
          worker_id?: string | null
        }
        Update: {
          attempts?: number
          campaign_id?: string | null
          cancelled_at?: string | null
          contact_id?: string
          created_at?: string
          delivered_at?: string | null
          error_code?: string | null
          error_message?: string | null
          failed_at?: string | null
          id?: string
          idempotency_key?: string | null
          locked_at?: string | null
          max_attempts?: number
          organization_id?: string
          priority?: number
          processing_started_at?: string | null
          provider_message_id?: string | null
          provider_status?: string | null
          read_at?: string | null
          scheduled_at?: string | null
          sender_id?: string | null
          sent_at?: string | null
          status?: string
          template_id?: string | null
          updated_at?: string
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_jobs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_jobs_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_jobs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_jobs_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_jobs_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_id: string
          slug: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_id: string
          slug?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          slug?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      plans: {
        Row: {
          active: boolean
          code: string
          created_at: string
          id: string
          max_numbers: number
          max_users: number
          name: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          id?: string
          max_numbers?: number
          max_users?: number
          name: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          id?: string
          max_numbers?: number
          max_users?: number
          name?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      schedules: {
        Row: {
          campaign_id: string | null
          created_at: string
          id: string
          organization_id: string
          starts_at: string
          status: string
          timezone: string
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string
          id?: string
          organization_id: string
          starts_at: string
          status?: string
          timezone?: string
        }
        Update: {
          campaign_id?: string | null
          created_at?: string
          id?: string
          organization_id?: string
          starts_at?: string
          status?: string
          timezone?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedules_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          organization_id: string
          plan_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          organization_id: string
          plan_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          organization_id?: string
          plan_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      suppression_list: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          phone_e164: string
          reason: string | null
          source: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          phone_e164: string
          reason?: string | null
          source?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          phone_e164?: string
          reason?: string | null
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "suppression_list_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      templates: {
        Row: {
          body: string
          category: string | null
          created_at: string
          footer: string | null
          header: string | null
          id: string
          language: string
          name: string
          organization_id: string
          provider_template_id: string | null
          status: string
          updated_at: string
          variables: Json
        }
        Insert: {
          body: string
          category?: string | null
          created_at?: string
          footer?: string | null
          header?: string | null
          id?: string
          language?: string
          name: string
          organization_id: string
          provider_template_id?: string | null
          status?: string
          updated_at?: string
          variables?: Json
        }
        Update: {
          body?: string
          category?: string | null
          created_at?: string
          footer?: string | null
          header?: string | null
          id?: string
          language?: string
          name?: string
          organization_id?: string
          provider_template_id?: string | null
          status?: string
          updated_at?: string
          variables?: Json
        }
        Relationships: [
          {
            foreignKeyName: "templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_daily: {
        Row: {
          delivered: number
          failed: number
          id: string
          opt_outs: number
          organization_id: string
          read: number
          replied: number
          sent: number
          usage_date: string
        }
        Insert: {
          delivered?: number
          failed?: number
          id?: string
          opt_outs?: number
          organization_id: string
          read?: number
          replied?: number
          sent?: number
          usage_date?: string
        }
        Update: {
          delivered?: number
          failed?: number
          id?: string
          opt_outs?: number
          organization_id?: string
          read?: number
          replied?: number
          sent?: number
          usage_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_daily_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_events: {
        Row: {
          error: string | null
          event_type: string | null
          external_event_id: string | null
          id: string
          organization_id: string | null
          payload: Json
          processed_at: string | null
          processing_status: string
          provider: string
          received_at: string
        }
        Insert: {
          error?: string | null
          event_type?: string | null
          external_event_id?: string | null
          id?: string
          organization_id?: string | null
          payload?: Json
          processed_at?: string | null
          processing_status?: string
          provider?: string
          received_at?: string
        }
        Update: {
          error?: string | null
          event_type?: string | null
          external_event_id?: string | null
          id?: string
          organization_id?: string | null
          payload?: Json
          processed_at?: string | null
          processing_status?: string
          provider?: string
          received_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_accounts: {
        Row: {
          business_account_id: string | null
          connected_at: string | null
          connection_status: string
          created_at: string
          display_phone_number: string | null
          distribution_weight: number
          id: string
          internal_name: string
          is_enabled: boolean
          last_seen_at: string | null
          last_successful_send_at: string | null
          last_webhook_at: string | null
          organization_id: string
          phone: string | null
          phone_number_id: string | null
          provider: string
          provider_instance_id: string | null
          qr_expires_at: string | null
          quality_status: string | null
          reconnect_required: boolean
          session_id: string | null
          session_status: string
          status: string
          updated_at: string
          verified_name: string | null
          waba_id: string | null
          weight: number | null
        }
        Insert: {
          business_account_id?: string | null
          connected_at?: string | null
          connection_status?: string
          created_at?: string
          display_phone_number?: string | null
          distribution_weight?: number
          id?: string
          internal_name: string
          is_enabled?: boolean
          last_seen_at?: string | null
          last_successful_send_at?: string | null
          last_webhook_at?: string | null
          organization_id: string
          phone?: string | null
          phone_number_id?: string | null
          provider?: string
          provider_instance_id?: string | null
          qr_expires_at?: string | null
          quality_status?: string | null
          reconnect_required?: boolean
          session_id?: string | null
          session_status?: string
          status?: string
          updated_at?: string
          verified_name?: string | null
          waba_id?: string | null
          weight?: number | null
        }
        Update: {
          business_account_id?: string | null
          connected_at?: string | null
          connection_status?: string
          created_at?: string
          display_phone_number?: string | null
          distribution_weight?: number
          id?: string
          internal_name?: string
          is_enabled?: boolean
          last_seen_at?: string | null
          last_successful_send_at?: string | null
          last_webhook_at?: string | null
          organization_id?: string
          phone?: string | null
          phone_number_id?: string | null
          provider?: string
          provider_instance_id?: string | null
          qr_expires_at?: string | null
          quality_status?: string | null
          reconnect_required?: boolean
          session_id?: string | null
          session_status?: string
          status?: string
          updated_at?: string
          verified_name?: string | null
          waba_id?: string | null
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_accounts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_session_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          organization_id: string
          payload: Json
          whatsapp_account_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          organization_id: string
          payload?: Json
          whatsapp_account_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          organization_id?: string
          payload?: Json
          whatsapp_account_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_session_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_session_events_whatsapp_account_id_fkey"
            columns: ["whatsapp_account_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_evolution_gateway_config: {
        Args: { p_organization_id: string }
        Returns: {
          api_key: string
          base_url: string
        }[]
      }
      is_org_admin: { Args: { org_id: string }; Returns: boolean }
      is_org_member: { Args: { org_id: string }; Returns: boolean }
      set_evolution_gateway_config: {
        Args: {
          p_api_key: string
          p_base_url: string
          p_organization_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
