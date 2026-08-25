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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      analytics_events: {
        Row: {
          created_at: string
          domain_category: string | null
          event_type: string
          id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          domain_category?: string | null
          event_type: string
          id?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          domain_category?: string | null
          event_type?: string
          id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analytics_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      analyze_requests: {
        Row: {
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "analyze_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      check_ledger: {
        Row: {
          amount: number
          batch_id: string | null
          created_at: string
          entry_type: string
          id: number
          note: string | null
          related_check_id: string | null
          related_stripe_payment_intent_id: string | null
          user_id: string
        }
        Insert: {
          amount: number
          batch_id?: string | null
          created_at?: string
          entry_type: string
          id?: never
          note?: string | null
          related_check_id?: string | null
          related_stripe_payment_intent_id?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          batch_id?: string | null
          created_at?: string
          entry_type?: string
          id?: never
          note?: string | null
          related_check_id?: string | null
          related_stripe_payment_intent_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "check_ledger_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "credit_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "check_ledger_related_check_id_fkey"
            columns: ["related_check_id"]
            isOneToOne: false
            referencedRelation: "checks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "check_ledger_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      check_sentiment: {
        Row: {
          check_id: string
          created_at: string
          note: string | null
          sentiment: string
          user_id: string
        }
        Insert: {
          check_id: string
          created_at?: string
          note?: string | null
          sentiment: string
          user_id: string
        }
        Update: {
          check_id?: string
          created_at?: string
          note?: string | null
          sentiment?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "check_sentiment_check_id_fkey"
            columns: ["check_id"]
            isOneToOne: true
            referencedRelation: "checks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "check_sentiment_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      checks: {
        Row: {
          company_name: string | null
          created_at: string
          cv_file_name: string
          cv_storage_path: string
          detected_language: string | null
          documents_purged: boolean
          documents_purged_at: string | null
          error_message: string | null
          experience_score: number | null
          funding_pack_id: string | null
          id: string
          interview_probability_score: number | null
          job_description: string
          job_title: string | null
          output_language: string
          skills_score: number | null
          status: Database["public"]["Enums"]["check_status"]
          trustpilot_notified_at: string | null
          updated_at: string
          upload_purge_attempts: number
          uploads_purged: boolean
          uploads_purged_at: string | null
          user_id: string
          uvp_score: number | null
        }
        Insert: {
          company_name?: string | null
          created_at?: string
          cv_file_name: string
          cv_storage_path: string
          detected_language?: string | null
          documents_purged?: boolean
          documents_purged_at?: string | null
          error_message?: string | null
          experience_score?: number | null
          funding_pack_id?: string | null
          id?: string
          interview_probability_score?: number | null
          job_description?: string
          job_title?: string | null
          output_language?: string
          skills_score?: number | null
          status?: Database["public"]["Enums"]["check_status"]
          trustpilot_notified_at?: string | null
          updated_at?: string
          upload_purge_attempts?: number
          uploads_purged?: boolean
          uploads_purged_at?: string | null
          user_id: string
          uvp_score?: number | null
        }
        Update: {
          company_name?: string | null
          created_at?: string
          cv_file_name?: string
          cv_storage_path?: string
          detected_language?: string | null
          documents_purged?: boolean
          documents_purged_at?: string | null
          error_message?: string | null
          experience_score?: number | null
          funding_pack_id?: string | null
          id?: string
          interview_probability_score?: number | null
          job_description?: string
          job_title?: string | null
          output_language?: string
          skills_score?: number | null
          status?: Database["public"]["Enums"]["check_status"]
          trustpilot_notified_at?: string | null
          updated_at?: string
          upload_purge_attempts?: number
          uploads_purged?: boolean
          uploads_purged_at?: string | null
          user_id?: string
          uvp_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "checks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_batches: {
        Row: {
          checks_granted: number
          checks_remaining: number
          expires_at: string | null
          granted_at: string
          id: string
          pack_id: string | null
          source: string
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          user_id: string
        }
        Insert: {
          checks_granted: number
          checks_remaining: number
          expires_at?: string | null
          granted_at?: string
          id?: string
          pack_id?: string | null
          source: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          user_id: string
        }
        Update: {
          checks_granted?: number
          checks_remaining?: number
          expires_at?: string | null
          granted_at?: string
          id?: string
          pack_id?: string | null
          source?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_batches_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      extension_connect_codes: {
        Row: {
          code: string
          created_at: string
          expires_at: string
          id: string
          used: boolean
          user_id: string
        }
        Insert: {
          code: string
          created_at?: string
          expires_at?: string
          id?: string
          used?: boolean
          user_id: string
        }
        Update: {
          code?: string
          created_at?: string
          expires_at?: string
          id?: string
          used?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "extension_connect_codes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback: {
        Row: {
          check_id: string
          created_at: string
          id: string
          improvements: Json
          prospects: Json
          strengths: Json
        }
        Insert: {
          check_id: string
          created_at?: string
          id?: string
          improvements?: Json
          prospects?: Json
          strengths?: Json
        }
        Update: {
          check_id?: string
          created_at?: string
          id?: string
          improvements?: Json
          prospects?: Json
          strengths?: Json
        }
        Relationships: [
          {
            foreignKeyName: "feedback_check_id_fkey"
            columns: ["check_id"]
            isOneToOne: true
            referencedRelation: "checks"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_audit_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          request_summary: Json
          result_summary: Json | null
          status: string
          test_mode: boolean
          tool_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          request_summary: Json
          result_summary?: Json | null
          status: string
          test_mode: boolean
          tool_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          request_summary?: Json
          result_summary?: Json | null
          status?: string
          test_mode?: boolean
          tool_name?: string
        }
        Relationships: []
      }
      instagram_connection: {
        Row: {
          access_token: string
          connected_at: string
          id: boolean
          ig_user_id: string
          ig_username: string
          scopes: string
          token_expires_at: string
          updated_at: string
        }
        Insert: {
          access_token: string
          connected_at?: string
          id?: boolean
          ig_user_id: string
          ig_username: string
          scopes: string
          token_expires_at: string
          updated_at?: string
        }
        Update: {
          access_token?: string
          connected_at?: string
          id?: boolean
          ig_user_id?: string
          ig_username?: string
          scopes?: string
          token_expires_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      job_captures: {
        Row: {
          company_name: string | null
          created_at: string
          expires_at: string
          id: string
          job_description: string
          job_title: string | null
          job_url: string | null
          source_domain: string | null
          user_id: string
        }
        Insert: {
          company_name?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          job_description: string
          job_title?: string | null
          job_url?: string | null
          source_domain?: string | null
          user_id?: string
        }
        Update: {
          company_name?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          job_description?: string
          job_title?: string | null
          job_url?: string | null
          source_domain?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_captures_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      newsletter_subscribers: {
        Row: {
          consent_at: string
          consent_source: string
          consent_text: string
          created_at: string
          email: string
          id: string
          status: string
          unsubscribe_token: string
          unsubscribed_at: string | null
          updated_at: string
        }
        Insert: {
          consent_at?: string
          consent_source: string
          consent_text: string
          created_at?: string
          email: string
          id?: string
          status?: string
          unsubscribe_token?: string
          unsubscribed_at?: string | null
          updated_at?: string
        }
        Update: {
          consent_at?: string
          consent_source?: string
          consent_text?: string
          created_at?: string
          email?: string
          id?: string
          status?: string
          unsubscribe_token?: string
          unsubscribed_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      product_feedback: {
        Row: {
          check_id: string | null
          comment: string | null
          created_at: string
          display_name: string | null
          email: string
          feature_consent: boolean
          feature_consent_at: string | null
          id: string
          rating: number
          target_role: string | null
          user_id: string
        }
        Insert: {
          check_id?: string | null
          comment?: string | null
          created_at?: string
          display_name?: string | null
          email: string
          feature_consent?: boolean
          feature_consent_at?: string | null
          id?: string
          rating: number
          target_role?: string | null
          user_id: string
        }
        Update: {
          check_id?: string | null
          comment?: string | null
          created_at?: string
          display_name?: string | null
          email?: string
          feature_consent?: boolean
          feature_consent_at?: string | null
          id?: string
          rating?: number
          target_role?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_feedback_check_id_fkey"
            columns: ["check_id"]
            isOneToOne: false
            referencedRelation: "checks"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          checks_balance: number
          created_at: string
          email: string
          full_name: string | null
          id: string
          keyword_scans_consumed: number
          lifetime_checks_consumed: number
          updated_at: string
        }
        Insert: {
          checks_balance?: number
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          keyword_scans_consumed?: number
          lifetime_checks_consumed?: number
          updated_at?: string
        }
        Update: {
          checks_balance?: number
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          keyword_scans_consumed?: number
          lifetime_checks_consumed?: number
          updated_at?: string
        }
        Relationships: []
      }
      rate_limit_events: {
        Row: {
          bucket: string
          created_at: string
          id: number
          user_id: string
        }
        Insert: {
          bucket: string
          created_at?: string
          id?: never
          user_id: string
        }
        Update: {
          bucket?: string
          created_at?: string
          id?: never
          user_id?: string
        }
        Relationships: []
      }
      stripe_webhook_events: {
        Row: {
          created_at: string
          id: string
        }
        Insert: {
          created_at?: string
          id: string
        }
        Update: {
          created_at?: string
          id?: string
        }
        Relationships: []
      }
      upload_purge_log: {
        Row: {
          attempt_number: number
          attempted_at: string
          check_id: string | null
          id: string
          success: boolean
        }
        Insert: {
          attempt_number: number
          attempted_at?: string
          check_id?: string | null
          id?: string
          success: boolean
        }
        Update: {
          attempt_number?: number
          attempted_at?: string
          check_id?: string | null
          id?: string
          success?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "upload_purge_log_check_id_fkey"
            columns: ["check_id"]
            isOneToOne: false
            referencedRelation: "checks"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      public_testimonials: {
        Row: {
          comment: string | null
          created_at: string | null
          display_name: string | null
          rating: number | null
          target_role: string | null
        }
        Insert: {
          comment?: string | null
          created_at?: string | null
          display_name?: string | null
          rating?: number | null
          target_role?: string | null
        }
        Update: {
          comment?: string | null
          created_at?: string | null
          display_name?: string | null
          rating?: number | null
          target_role?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      check_and_record_rate_limit: {
        Args: {
          p_bucket: string
          p_limit: number
          p_user_id: string
          p_window_seconds: number
        }
        Returns: boolean
      }
      complete_check_analysis: {
        Args: {
          p_check_id: string
          p_company_name?: string
          p_detected_language: string
          p_experience_score?: number
          p_job_title?: string
          p_score: number
          p_skills_score?: number
          p_user_id: string
          p_uvp_score?: number
        }
        Returns: undefined
      }
      expire_credit_batches: { Args: never; Returns: undefined }
      get_check_count: { Args: { p_user_id: string }; Returns: number }
      grant_check_credits: {
        Args: {
          p_amount: number
          p_expires_at?: string
          p_pack_id?: string
          p_source: string
          p_stripe_checkout_session_id?: string
          p_stripe_payment_intent_id?: string
          p_user_id: string
        }
        Returns: undefined
      }
      is_most_recent_check: {
        Args: { p_created_at: string; p_user_id: string }
        Returns: boolean
      }
      refund_check_credit: {
        Args: { p_check_id: string; p_user_id: string }
        Returns: undefined
      }
      reserve_check_analysis: {
        Args: { p_check_id: string; p_user_id: string }
        Returns: {
          allowed: boolean
          reason: string
        }[]
      }
      sweep_old_purge_log: { Args: never; Returns: undefined }
      sweep_stale_processing_checks: { Args: never; Returns: undefined }
    }
    Enums: {
      check_status: "draft" | "processing" | "completed" | "failed"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      check_status: ["draft", "processing", "completed", "failed"],
    },
  },
} as const
