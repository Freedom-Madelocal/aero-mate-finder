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
      master_spec_uploads: {
        Row: {
          created_at: string
          file_name: string
          id: string
          row_count: number
          uploaded_at: string
        }
        Insert: {
          created_at?: string
          file_name: string
          id?: string
          row_count?: number
          uploaded_at?: string
        }
        Update: {
          created_at?: string
          file_name?: string
          id?: string
          row_count?: number
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
          flame_retardant: boolean
          flatwise_tension_mpa: number | null
          freezer_life_months: number | null
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
          flame_retardant?: boolean
          flatwise_tension_mpa?: number | null
          freezer_life_months?: number | null
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
          flame_retardant?: boolean
          flatwise_tension_mpa?: number | null
          freezer_life_months?: number | null
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
