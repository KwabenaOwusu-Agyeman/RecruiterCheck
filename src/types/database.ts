export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          full_name: string | null
          subscription_tier: 'free' | 'premium_weekly' | 'premium_monthly'
          subscription_status: 'active' | 'cancelled' | 'past_due' | 'trialing'
          stripe_customer_id: string | null
          lifetime_checks_consumed: number
          daily_checks_consumed: number
          daily_checks_reset_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          full_name?: string | null
          subscription_tier?: 'free' | 'premium_weekly' | 'premium_monthly'
          subscription_status?: 'active' | 'cancelled' | 'past_due' | 'trialing'
          stripe_customer_id?: string | null
          lifetime_checks_consumed?: number
          daily_checks_consumed?: number
          daily_checks_reset_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>
        Relationships: []
      }
      checks: {
        Row: {
          id: string
          user_id: string
          job_title: string | null
          company_name: string | null
          job_description: string
          cv_storage_path: string
          cv_file_name: string
          status: 'draft' | 'processing' | 'completed' | 'failed'
          interview_probability_score: number | null
          experience_score: number | null
          skills_score: number | null
          uvp_score: number | null
          error_message: string | null
          output_language: 'auto' | 'en' | 'nl'
          detected_language: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          job_title?: string | null
          company_name?: string | null
          job_description?: string
          cv_storage_path: string
          cv_file_name: string
          status?: 'draft' | 'processing' | 'completed' | 'failed'
          interview_probability_score?: number | null
          experience_score?: number | null
          skills_score?: number | null
          uvp_score?: number | null
          error_message?: string | null
          output_language?: 'auto' | 'en' | 'nl'
          detected_language?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['checks']['Insert']>
        Relationships: []
      }
      feedback: {
        Row: {
          id: string
          check_id: string
          strengths: Json
          improvements: Json
          prospects: Json
          created_at: string
        }
        Insert: {
          id?: string
          check_id: string
          strengths?: Json
          improvements?: Json
          prospects?: Json
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['feedback']['Insert']>
        Relationships: []
      }
      subscriptions: {
        Row: {
          id: string
          user_id: string
          plan: 'premium_weekly' | 'premium_monthly'
          status: 'active' | 'cancelled' | 'past_due' | 'trialing'
          stripe_subscription_id: string | null
          current_period_end: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          plan: 'premium_weekly' | 'premium_monthly'
          status?: 'active' | 'cancelled' | 'past_due' | 'trialing'
          stripe_subscription_id?: string | null
          current_period_end?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['subscriptions']['Insert']>
        Relationships: []
      }
      product_feedback: {
        Row: {
          id: string
          user_id: string
          email: string
          rating: number
          comment: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          email: string
          rating: number
          comment?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['product_feedback']['Insert']>
        Relationships: []
      }
      analytics_events: {
        Row: {
          id: string
          user_id: string
          event_type: string
          domain_category: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id?: string
          event_type: string
          domain_category?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['analytics_events']['Insert']>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
  }
}
