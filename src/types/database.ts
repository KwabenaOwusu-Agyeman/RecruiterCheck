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
      checks: {
        Row: {
          company_name: string | null
          created_at: string
          cv_file_name: string
          cv_storage_path: string
          detected_language: string | null
          error_message: string | null
          experience_score: number | null
          id: string
          interview_probability_score: number | null
          job_description: string
          job_title: string | null
          output_language: string
          skills_score: number | null
          status: Database["public"]["Enums"]["check_status"]
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
          error_message?: string | null
          experience_score?: number | null
          id?: string
          interview_probability_score?: number | null
          job_description?: string
          job_title?: string | null
          output_language?: string
          skills_score?: number | null
          status?: Database["public"]["Enums"]["check_status"]
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
          error_message?: string | null
          experience_score?: number | null
          id?: string
          interview_probability_score?: number | null
          job_description?: string
          job_title?: string | null
          output_language?: string
          skills_score?: number | null
          status?: Database["public"]["Enums"]["check_status"]
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
          created_at: string
          email: string
          full_name: string | null
          id: string
          lifetime_checks_consumed: number
          period_checks_consumed: number
          period_checks_limit: number
          stripe_customer_id: string | null
          subscription_status: Database["public"]["Enums"]["subscription_status"]
          subscription_tier: Database["public"]["Enums"]["subscription_tier"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          lifetime_checks_consumed?: number
          period_checks_consumed?: number
          period_checks_limit?: number
          stripe_customer_id?: string | null
          subscription_status?: Database["public"]["Enums"]["subscription_status"]
          subscription_tier?: Database["public"]["Enums"]["subscription_tier"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          lifetime_checks_consumed?: number
          period_checks_consumed?: number
          period_checks_limit?: number
          stripe_customer_id?: string | null
          subscription_status?: Database["public"]["Enums"]["subscription_status"]
          subscription_tier?: Database["public"]["Enums"]["subscription_tier"]
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
      subscriptions: {
        Row: {
          created_at: string
          current_period_end: string | null
          id: string
          plan: Database["public"]["Enums"]["subscription_tier"]
          status: Database["public"]["Enums"]["subscription_status"]
          stripe_subscription_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_period_end?: string | null
          id?: string
          plan: Database["public"]["Enums"]["subscription_tier"]
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_period_end?: string | null
          id?: string
          plan?: Database["public"]["Enums"]["subscription_tier"]
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      [_ in never]: never
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
      get_check_count: { Args: { p_user_id: string }; Returns: number }
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
      subscription_status: "active" | "cancelled" | "past_due" | "trialing"
      subscription_tier: "free" | "starter" | "active" | "power"
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
      subscription_status: ["active", "cancelled", "past_due", "trialing"],
      subscription_tier: ["free", "starter", "active", "power"],
    },
  },
} as const
