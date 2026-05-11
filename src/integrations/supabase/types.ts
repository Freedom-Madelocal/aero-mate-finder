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
      crm_contacts: {
        Row: {
          company: string | null
          created_at: string
          created_by: string | null
          email: string
          full_name: string | null
          id: string
          lead_signup_id: string | null
          notes: string | null
          phone: string | null
          promoted_at: string | null
          promoted_user_id: string | null
          source: string
          updated_at: string
        }
        Insert: {
          company?: string | null
          created_at?: string
          created_by?: string | null
          email: string
          full_name?: string | null
          id?: string
          lead_signup_id?: string | null
          notes?: string | null
          phone?: string | null
          promoted_at?: string | null
          promoted_user_id?: string | null
          source?: string
          updated_at?: string
        }
        Update: {
          company?: string | null
          created_at?: string
          created_by?: string | null
          email?: string
          full_name?: string | null
          id?: string
          lead_signup_id?: string | null
          notes?: string | null
          phone?: string | null
          promoted_at?: string | null
          promoted_user_id?: string | null
          source?: string
          updated_at?: string
        }
        Relationships: []
      }
      demo_requests: {
        Row: {
          company: string
          created_at: string
          id: string
          message: string | null
          name: string
          role: string | null
          team_size: string | null
          work_email: string
        }
        Insert: {
          company: string
          created_at?: string
          id?: string
          message?: string | null
          name: string
          role?: string | null
          team_size?: string | null
          work_email: string
        }
        Update: {
          company?: string
          created_at?: string
          id?: string
          message?: string | null
          name?: string
          role?: string | null
          team_size?: string | null
          work_email?: string
        }
        Relationships: []
      }
      direct_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          organization_id: string
          read_at: string | null
          recipient_id: string
          sender_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          organization_id: string
          read_at?: string | null
          recipient_id: string
          sender_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          organization_id?: string
          read_at?: string | null
          recipient_id?: string
          sender_id?: string
        }
        Relationships: []
      }
      lead_magnet_signups: {
        Row: {
          company: string | null
          created_at: string
          email: string
          email_domain: string
          full_name: string | null
          id: string
          source: string | null
        }
        Insert: {
          company?: string | null
          created_at?: string
          email: string
          email_domain: string
          full_name?: string | null
          id?: string
          source?: string | null
        }
        Update: {
          company?: string | null
          created_at?: string
          email?: string
          email_domain?: string
          full_name?: string | null
          id?: string
          source?: string | null
        }
        Relationships: []
      }
      master_spec_uploads: {
        Row: {
          created_at: string
          file_name: string
          id: string
          row_count: number
          source_type: string
          uploaded_at: string
        }
        Insert: {
          created_at?: string
          file_name: string
          id?: string
          row_count?: number
          source_type?: string
          uploaded_at?: string
        }
        Update: {
          created_at?: string
          file_name?: string
          id?: string
          row_count?: number
          source_type?: string
          uploaded_at?: string
        }
        Relationships: []
      }
      master_specs: {
        Row: {
          applications: string | null
          climbing_drum_peel_in_lb_per_in: number | null
          created_at: string
          crossover_product: string | null
          crossover_vendor: string | null
          cure_temperature_c: number | null
          cure_time: string | null
          cvcm_pct: number | null
          dry_tg_onset_c: number | null
          engineer_default_name: string | null
          flame_retardant: boolean
          flatwise_tension_mpa: number | null
          freezer_life_months: number | null
          frequent_reorder: boolean
          high_temperature: boolean
          id: string
          impact_resistant: boolean
          low_dielectric: boolean
          low_moisture_absorption: boolean
          material_category: string | null
          max_service_temperature_c: number | null
          minimum_order_quantity: string | null
          notes: string | null
          ooa_vbo_capable: boolean
          out_life_days: number | null
          peak_tg_c: number | null
          process_method: string | null
          product_family: string | null
          product_form: string | null
          product_name: string
          profiles: string[]
          qualifications_standards: string | null
          reinforcement: string | null
          resin_chemistry: string | null
          source_document: string | null
          t_peel_n_per_25mm: number | null
          tensile_lap_shear_mpa: number | null
          tml_pct: number | null
          toughened: boolean
          updated_at: string
          uploaded_from: string | null
          vendor: string
          wet_tg_c: number | null
        }
        Insert: {
          applications?: string | null
          climbing_drum_peel_in_lb_per_in?: number | null
          created_at?: string
          crossover_product?: string | null
          crossover_vendor?: string | null
          cure_temperature_c?: number | null
          cure_time?: string | null
          cvcm_pct?: number | null
          dry_tg_onset_c?: number | null
          engineer_default_name?: string | null
          flame_retardant?: boolean
          flatwise_tension_mpa?: number | null
          freezer_life_months?: number | null
          frequent_reorder?: boolean
          high_temperature?: boolean
          id?: string
          impact_resistant?: boolean
          low_dielectric?: boolean
          low_moisture_absorption?: boolean
          material_category?: string | null
          max_service_temperature_c?: number | null
          minimum_order_quantity?: string | null
          notes?: string | null
          ooa_vbo_capable?: boolean
          out_life_days?: number | null
          peak_tg_c?: number | null
          process_method?: string | null
          product_family?: string | null
          product_form?: string | null
          product_name: string
          profiles?: string[]
          qualifications_standards?: string | null
          reinforcement?: string | null
          resin_chemistry?: string | null
          source_document?: string | null
          t_peel_n_per_25mm?: number | null
          tensile_lap_shear_mpa?: number | null
          tml_pct?: number | null
          toughened?: boolean
          updated_at?: string
          uploaded_from?: string | null
          vendor: string
          wet_tg_c?: number | null
        }
        Update: {
          applications?: string | null
          climbing_drum_peel_in_lb_per_in?: number | null
          created_at?: string
          crossover_product?: string | null
          crossover_vendor?: string | null
          cure_temperature_c?: number | null
          cure_time?: string | null
          cvcm_pct?: number | null
          dry_tg_onset_c?: number | null
          engineer_default_name?: string | null
          flame_retardant?: boolean
          flatwise_tension_mpa?: number | null
          freezer_life_months?: number | null
          frequent_reorder?: boolean
          high_temperature?: boolean
          id?: string
          impact_resistant?: boolean
          low_dielectric?: boolean
          low_moisture_absorption?: boolean
          material_category?: string | null
          max_service_temperature_c?: number | null
          minimum_order_quantity?: string | null
          notes?: string | null
          ooa_vbo_capable?: boolean
          out_life_days?: number | null
          peak_tg_c?: number | null
          process_method?: string | null
          product_family?: string | null
          product_form?: string | null
          product_name?: string
          profiles?: string[]
          qualifications_standards?: string | null
          reinforcement?: string | null
          resin_chemistry?: string | null
          source_document?: string | null
          t_peel_n_per_25mm?: number | null
          tensile_lap_shear_mpa?: number | null
          tml_pct?: number | null
          toughened?: boolean
          updated_at?: string
          uploaded_from?: string | null
          vendor?: string
          wet_tg_c?: number | null
        }
        Relationships: []
      }
      materials: {
        Row: {
          active_lots: number
          available_qty: number
          available_unit: string
          chemistry: string
          created_at: string
          cure_temp: string
          custom_fields: Json | null
          form: string
          former_name: string | null
          id: string
          incoming_eta: string | null
          incoming_qty: number
          max_service_temp: string
          nasa_e595: string
          notes: string | null
          ooa_capable: string
          product: string
          source: string | null
          stock_report_name: string | null
          supplier: string
          total_lots: number
          updated_at: string
        }
        Insert: {
          active_lots?: number
          available_qty?: number
          available_unit?: string
          chemistry?: string
          created_at?: string
          cure_temp?: string
          custom_fields?: Json | null
          form?: string
          former_name?: string | null
          id: string
          incoming_eta?: string | null
          incoming_qty?: number
          max_service_temp?: string
          nasa_e595?: string
          notes?: string | null
          ooa_capable?: string
          product?: string
          source?: string | null
          stock_report_name?: string | null
          supplier?: string
          total_lots?: number
          updated_at?: string
        }
        Update: {
          active_lots?: number
          available_qty?: number
          available_unit?: string
          chemistry?: string
          created_at?: string
          cure_temp?: string
          custom_fields?: Json | null
          form?: string
          former_name?: string | null
          id?: string
          incoming_eta?: string | null
          incoming_qty?: number
          max_service_temp?: string
          nasa_e595?: string
          notes?: string | null
          ooa_capable?: string
          product?: string
          source?: string | null
          stock_report_name?: string | null
          supplier?: string
          total_lots?: number
          updated_at?: string
        }
        Relationships: []
      }
      org_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          organization_id: string
          role: Database["public"]["Enums"]["app_role"]
          token: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          organization_id: string
          role: Database["public"]["Enums"]["app_role"]
          token: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          organization_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_invitations_organization_id_fkey"
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
          created_by: string | null
          id: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      procurement_requests: {
        Row: {
          chosen_vendor: string
          created_at: string
          engineer_name: string
          id: string
          master_spec_id: string
          note: string | null
          quantity: string | null
          status: string
          updated_at: string
        }
        Insert: {
          chosen_vendor?: string
          created_at?: string
          engineer_name?: string
          id?: string
          master_spec_id: string
          note?: string | null
          quantity?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          chosen_vendor?: string
          created_at?: string
          engineer_name?: string
          id?: string
          master_spec_id?: string
          note?: string | null
          quantity?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "procurement_requests_master_spec_id_fkey"
            columns: ["master_spec_id"]
            isOneToOne: false
            referencedRelation: "master_specs"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_sends: {
        Row: {
          body: string | null
          email: string
          id: string
          request_ids: string[]
          sent_at: string
          vendor: string
        }
        Insert: {
          body?: string | null
          email: string
          id?: string
          request_ids?: string[]
          sent_at?: string
          vendor: string
        }
        Update: {
          body?: string | null
          email?: string
          id?: string
          request_ids?: string[]
          sent_at?: string
          vendor?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          organization_id: string | null
          tour_completed_at: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          organization_id?: string | null
          tour_completed_at?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          organization_id?: string | null
          tour_completed_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      site_settings: {
        Row: {
          content: Json
          hero_video_url: string | null
          id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          content?: Json
          hero_video_url?: string | null
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          content?: Json
          hero_video_url?: string | null
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      stock_reports: {
        Row: {
          created_at: string
          custom_columns: string[]
          file_name: string
          id: string
          row_count: number
          uploaded_at: string
        }
        Insert: {
          created_at?: string
          custom_columns?: string[]
          file_name: string
          id?: string
          row_count?: number
          uploaded_at?: string
        }
        Update: {
          created_at?: string
          custom_columns?: string[]
          file_name?: string
          id?: string
          row_count?: number
          uploaded_at?: string
        }
        Relationships: []
      }
      user_activity: {
        Row: {
          created_at: string
          event_type: string
          id: string
          path: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          path?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          path?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_demo_settings: {
        Row: {
          demo_mode: boolean
          extension_requested_at: string | null
          first_login_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          demo_mode?: boolean
          extension_requested_at?: string | null
          first_login_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          demo_mode?: boolean
          extension_requested_at?: string | null
          first_login_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vendor_contacts: {
        Row: {
          contact_name: string | null
          created_at: string
          email: string
          id: string
          notes: string | null
          updated_at: string
          vendor: string
        }
        Insert: {
          contact_name?: string | null
          created_at?: string
          email: string
          id?: string
          notes?: string | null
          updated_at?: string
          vendor: string
        }
        Update: {
          contact_name?: string | null
          created_at?: string
          email?: string
          id?: string
          notes?: string | null
          updated_at?: string
          vendor?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_org: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_demo_active: { Args: { _user_id: string }; Returns: boolean }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      mark_invitation_accepted: { Args: { _email: string }; Returns: undefined }
      stamp_first_login: { Args: { _user_id: string }; Returns: undefined }
    }
    Enums: {
      app_role:
        | "super_admin"
        | "org_admin"
        | "engineer"
        | "procurement"
        | "dev"
        | "integrator"
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
      app_role: [
        "super_admin",
        "org_admin",
        "engineer",
        "procurement",
        "dev",
        "integrator",
      ],
    },
  },
} as const
