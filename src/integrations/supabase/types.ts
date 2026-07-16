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
      admin_audit_log: {
        Row: {
          action: string
          actor_user_id: string
          batch_id: string | null
          created_at: string
          details: Json
          id: string
          item_id: string | null
        }
        Insert: {
          action: string
          actor_user_id: string
          batch_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          item_id?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string
          batch_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          item_id?: string | null
        }
        Relationships: []
      }
      ai_settings: {
        Row: {
          daily_call_cap: number
          daily_cost_cap_usd: number
          enabled: boolean
          id: number
          updated_at: string
        }
        Insert: {
          daily_call_cap?: number
          daily_cost_cap_usd?: number
          enabled?: boolean
          id?: number
          updated_at?: string
        }
        Update: {
          daily_call_cap?: number
          daily_cost_cap_usd?: number
          enabled?: boolean
          id?: number
          updated_at?: string
        }
        Relationships: []
      }
      ai_usage_daily: {
        Row: {
          calls: number
          cost_usd: number
          created_at: string
          day: string
          failures: number
          id: string
          input_tokens: number
          model: string
          output_tokens: number
          updated_at: string
        }
        Insert: {
          calls?: number
          cost_usd?: number
          created_at?: string
          day: string
          failures?: number
          id?: string
          input_tokens?: number
          model: string
          output_tokens?: number
          updated_at?: string
        }
        Update: {
          calls?: number
          cost_usd?: number
          created_at?: string
          day?: string
          failures?: number
          id?: string
          input_tokens?: number
          model?: string
          output_tokens?: number
          updated_at?: string
        }
        Relationships: []
      }
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
      data_sheet_crawl_jobs: {
        Row: {
          crawl_mode: string
          created_at: string
          created_by: string | null
          error: string | null
          failed: number
          id: string
          max_pages: number
          pending_urls: Json
          processed: number
          search_template: string | null
          source_url: string
          status: string
          succeeded: number
          total: number
          updated_at: string
          vendor: string | null
        }
        Insert: {
          crawl_mode?: string
          created_at?: string
          created_by?: string | null
          error?: string | null
          failed?: number
          id?: string
          max_pages?: number
          pending_urls?: Json
          processed?: number
          search_template?: string | null
          source_url: string
          status?: string
          succeeded?: number
          total?: number
          updated_at?: string
          vendor?: string | null
        }
        Update: {
          crawl_mode?: string
          created_at?: string
          created_by?: string | null
          error?: string | null
          failed?: number
          id?: string
          max_pages?: number
          pending_urls?: Json
          processed?: number
          search_template?: string | null
          source_url?: string
          status?: string
          succeeded?: number
          total?: number
          updated_at?: string
          vendor?: string | null
        }
        Relationships: []
      }
      data_sheets: {
        Row: {
          confidence: number | null
          created_at: string
          doc_type: string
          error: string | null
          id: string
          job_id: string | null
          master_spec_id: string | null
          match_status: string
          page_url: string | null
          parsed_specs: Json
          pdf_path: string | null
          pdf_size: number | null
          pdf_url: string | null
          product_name: string | null
          raw_text: string | null
          source_url: string | null
          title: string | null
          updated_at: string
          vendor: string | null
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          doc_type?: string
          error?: string | null
          id?: string
          job_id?: string | null
          master_spec_id?: string | null
          match_status?: string
          page_url?: string | null
          parsed_specs?: Json
          pdf_path?: string | null
          pdf_size?: number | null
          pdf_url?: string | null
          product_name?: string | null
          raw_text?: string | null
          source_url?: string | null
          title?: string | null
          updated_at?: string
          vendor?: string | null
        }
        Update: {
          confidence?: number | null
          created_at?: string
          doc_type?: string
          error?: string | null
          id?: string
          job_id?: string | null
          master_spec_id?: string | null
          match_status?: string
          page_url?: string | null
          parsed_specs?: Json
          pdf_path?: string | null
          pdf_size?: number | null
          pdf_url?: string | null
          product_name?: string | null
          raw_text?: string | null
          source_url?: string | null
          title?: string | null
          updated_at?: string
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "data_sheets_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "data_sheet_crawl_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_sheets_master_spec_id_fkey"
            columns: ["master_spec_id"]
            isOneToOne: false
            referencedRelation: "master_specs"
            referencedColumns: ["id"]
          },
        ]
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
      feature_flags: {
        Row: {
          created_at: string
          description: string | null
          enabled: boolean
          key: string
          label: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          enabled?: boolean
          key: string
          label: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          enabled?: boolean
          key?: string
          label?: string
          updated_at?: string
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
      master_spec_scrape_jobs: {
        Row: {
          child_job_ids: string[]
          created_at: string
          current_spec_id: string | null
          failed: number
          finished_at: string | null
          id: string
          mode: string
          processed: number
          skipped: number
          started_at: string
          started_by: string | null
          status: string
          succeeded: number
          total: number
          updated_at: string
        }
        Insert: {
          child_job_ids?: string[]
          created_at?: string
          current_spec_id?: string | null
          failed?: number
          finished_at?: string | null
          id?: string
          mode?: string
          processed?: number
          skipped?: number
          started_at?: string
          started_by?: string | null
          status?: string
          succeeded?: number
          total?: number
          updated_at?: string
        }
        Update: {
          child_job_ids?: string[]
          created_at?: string
          current_spec_id?: string | null
          failed?: number
          finished_at?: string | null
          id?: string
          mode?: string
          processed?: number
          skipped?: number
          started_at?: string
          started_by?: string | null
          status?: string
          succeeded?: number
          total?: number
          updated_at?: string
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
          active_ingredient_or_resin: string | null
          application_process: string | null
          applications: string | null
          climbing_drum_peel_in_lb_per_in: number | null
          contextual_standards: Json | null
          created_at: string
          crossover_product: string | null
          crossover_vendor: string | null
          cure_temperature_c: number | null
          cure_time: string | null
          customers: string[]
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
          key_specs: string[]
          low_dielectric: boolean
          low_moisture_absorption: boolean
          material_category: string | null
          material_number: number | null
          max_service_temperature_c: number | null
          minimum_order_quantity: string | null
          notes: string | null
          ooa_vbo_capable: boolean
          out_life_days: number | null
          peak_tg_c: number | null
          process_method: string | null
          product_family: string | null
          product_form: string | null
          product_identifiers: Json | null
          product_name: string
          profiles: string[]
          qualifications: Json | null
          qualifications_standards: string | null
          reinforcement: string | null
          resin_chemistry: string | null
          shelf_life_months: number | null
          source_document: string | null
          storage_temp_max_c: number | null
          storage_temp_min_c: number | null
          t_peel_n_per_25mm: number | null
          tds_analyzed_at: string | null
          tds_pdf_downloaded_at: string | null
          tds_pdf_path: string | null
          tds_pdf_size: number | null
          tds_scrape_error: string | null
          tds_scrape_status: string | null
          tds_scraped_at: string | null
          tds_source_title: string | null
          tds_url: string | null
          tensile_lap_shear_mpa: number | null
          test_methods: Json | null
          test_results: Json | null
          tml_pct: number | null
          toughened: boolean
          updated_at: string
          uploaded_from: string | null
          vendor: string
          wet_tg_c: number | null
        }
        Insert: {
          active_ingredient_or_resin?: string | null
          application_process?: string | null
          applications?: string | null
          climbing_drum_peel_in_lb_per_in?: number | null
          contextual_standards?: Json | null
          created_at?: string
          crossover_product?: string | null
          crossover_vendor?: string | null
          cure_temperature_c?: number | null
          cure_time?: string | null
          customers?: string[]
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
          key_specs?: string[]
          low_dielectric?: boolean
          low_moisture_absorption?: boolean
          material_category?: string | null
          material_number?: number | null
          max_service_temperature_c?: number | null
          minimum_order_quantity?: string | null
          notes?: string | null
          ooa_vbo_capable?: boolean
          out_life_days?: number | null
          peak_tg_c?: number | null
          process_method?: string | null
          product_family?: string | null
          product_form?: string | null
          product_identifiers?: Json | null
          product_name: string
          profiles?: string[]
          qualifications?: Json | null
          qualifications_standards?: string | null
          reinforcement?: string | null
          resin_chemistry?: string | null
          shelf_life_months?: number | null
          source_document?: string | null
          storage_temp_max_c?: number | null
          storage_temp_min_c?: number | null
          t_peel_n_per_25mm?: number | null
          tds_analyzed_at?: string | null
          tds_pdf_downloaded_at?: string | null
          tds_pdf_path?: string | null
          tds_pdf_size?: number | null
          tds_scrape_error?: string | null
          tds_scrape_status?: string | null
          tds_scraped_at?: string | null
          tds_source_title?: string | null
          tds_url?: string | null
          tensile_lap_shear_mpa?: number | null
          test_methods?: Json | null
          test_results?: Json | null
          tml_pct?: number | null
          toughened?: boolean
          updated_at?: string
          uploaded_from?: string | null
          vendor: string
          wet_tg_c?: number | null
        }
        Update: {
          active_ingredient_or_resin?: string | null
          application_process?: string | null
          applications?: string | null
          climbing_drum_peel_in_lb_per_in?: number | null
          contextual_standards?: Json | null
          created_at?: string
          crossover_product?: string | null
          crossover_vendor?: string | null
          cure_temperature_c?: number | null
          cure_time?: string | null
          customers?: string[]
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
          key_specs?: string[]
          low_dielectric?: boolean
          low_moisture_absorption?: boolean
          material_category?: string | null
          material_number?: number | null
          max_service_temperature_c?: number | null
          minimum_order_quantity?: string | null
          notes?: string | null
          ooa_vbo_capable?: boolean
          out_life_days?: number | null
          peak_tg_c?: number | null
          process_method?: string | null
          product_family?: string | null
          product_form?: string | null
          product_identifiers?: Json | null
          product_name?: string
          profiles?: string[]
          qualifications?: Json | null
          qualifications_standards?: string | null
          reinforcement?: string | null
          resin_chemistry?: string | null
          shelf_life_months?: number | null
          source_document?: string | null
          storage_temp_max_c?: number | null
          storage_temp_min_c?: number | null
          t_peel_n_per_25mm?: number | null
          tds_analyzed_at?: string | null
          tds_pdf_downloaded_at?: string | null
          tds_pdf_path?: string | null
          tds_pdf_size?: number | null
          tds_scrape_error?: string | null
          tds_scrape_status?: string | null
          tds_scraped_at?: string | null
          tds_source_title?: string | null
          tds_url?: string | null
          tensile_lap_shear_mpa?: number | null
          test_methods?: Json | null
          test_results?: Json | null
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
      scrape_logs: {
        Row: {
          attempted_url: string | null
          bulk_job_id: string | null
          child_job_id: string | null
          created_at: string
          data_sheet_id: string | null
          details: Json | null
          error_message: string | null
          http_status: number | null
          id: string
          master_spec_id: string | null
          product_name: string | null
          source_url: string | null
          status: string
          step: string
          vendor: string | null
        }
        Insert: {
          attempted_url?: string | null
          bulk_job_id?: string | null
          child_job_id?: string | null
          created_at?: string
          data_sheet_id?: string | null
          details?: Json | null
          error_message?: string | null
          http_status?: number | null
          id?: string
          master_spec_id?: string | null
          product_name?: string | null
          source_url?: string | null
          status: string
          step: string
          vendor?: string | null
        }
        Update: {
          attempted_url?: string | null
          bulk_job_id?: string | null
          child_job_id?: string | null
          created_at?: string
          data_sheet_id?: string | null
          details?: Json | null
          error_message?: string | null
          http_status?: number | null
          id?: string
          master_spec_id?: string | null
          product_name?: string | null
          source_url?: string | null
          status?: string
          step?: string
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scrape_logs_bulk_job_id_fkey"
            columns: ["bulk_job_id"]
            isOneToOne: false
            referencedRelation: "master_spec_scrape_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scrape_logs_child_job_id_fkey"
            columns: ["child_job_id"]
            isOneToOne: false
            referencedRelation: "data_sheet_crawl_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scrape_logs_data_sheet_id_fkey"
            columns: ["data_sheet_id"]
            isOneToOne: false
            referencedRelation: "data_sheets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scrape_logs_master_spec_id_fkey"
            columns: ["master_spec_id"]
            isOneToOne: false
            referencedRelation: "master_specs"
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
      spec_corrections: {
        Row: {
          actor_user_id: string | null
          after_values: Json
          before_values: Json
          correction_key: string
          created_at: string
          evidence: string | null
          expected_document_hash: string | null
          id: string
          spec_id: string
        }
        Insert: {
          actor_user_id?: string | null
          after_values: Json
          before_values: Json
          correction_key: string
          created_at?: string
          evidence?: string | null
          expected_document_hash?: string | null
          id?: string
          spec_id: string
        }
        Update: {
          actor_user_id?: string | null
          after_values?: Json
          before_values?: Json
          correction_key?: string
          created_at?: string
          evidence?: string | null
          expected_document_hash?: string | null
          id?: string
          spec_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "spec_corrections_spec_id_fkey"
            columns: ["spec_id"]
            isOneToOne: false
            referencedRelation: "master_specs"
            referencedColumns: ["id"]
          },
        ]
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
      tds_analysis_batches: {
        Row: {
          created_at: string
          created_by: string
          done_count: number
          failed_count: number
          id: string
          label: string | null
          paused_at: string | null
          paused_reason: string | null
          pending_count: number
          processing_count: number
          resumed_at: string | null
          skipped_cache_count: number
          status: string
          terminal_count: number
          total: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          done_count?: number
          failed_count?: number
          id?: string
          label?: string | null
          paused_at?: string | null
          paused_reason?: string | null
          pending_count?: number
          processing_count?: number
          resumed_at?: string | null
          skipped_cache_count?: number
          status?: string
          terminal_count?: number
          total?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          done_count?: number
          failed_count?: number
          id?: string
          label?: string | null
          paused_at?: string | null
          paused_reason?: string | null
          pending_count?: number
          processing_count?: number
          resumed_at?: string | null
          skipped_cache_count?: number
          status?: string
          terminal_count?: number
          total?: number
          updated_at?: string
        }
        Relationships: []
      }
      tds_analysis_items: {
        Row: {
          attempts: number
          batch_id: string
          client_request_id: string | null
          completed_at: string | null
          cost_usd: number | null
          created_at: string
          document_hash: string | null
          error: string | null
          error_class: string | null
          error_code: string | null
          id: string
          input_tokens: number | null
          last_error_at: string | null
          latency_ms: number | null
          lease_until: string | null
          max_attempts: number
          model: string | null
          next_attempt_at: string | null
          next_run_at: string | null
          output_tokens: number | null
          prompt_version: string | null
          spec_id: string
          status: string
          updated_at: string
          updated_fields: number | null
        }
        Insert: {
          attempts?: number
          batch_id: string
          client_request_id?: string | null
          completed_at?: string | null
          cost_usd?: number | null
          created_at?: string
          document_hash?: string | null
          error?: string | null
          error_class?: string | null
          error_code?: string | null
          id?: string
          input_tokens?: number | null
          last_error_at?: string | null
          latency_ms?: number | null
          lease_until?: string | null
          max_attempts?: number
          model?: string | null
          next_attempt_at?: string | null
          next_run_at?: string | null
          output_tokens?: number | null
          prompt_version?: string | null
          spec_id: string
          status?: string
          updated_at?: string
          updated_fields?: number | null
        }
        Update: {
          attempts?: number
          batch_id?: string
          client_request_id?: string | null
          completed_at?: string | null
          cost_usd?: number | null
          created_at?: string
          document_hash?: string | null
          error?: string | null
          error_class?: string | null
          error_code?: string | null
          id?: string
          input_tokens?: number | null
          last_error_at?: string | null
          latency_ms?: number | null
          lease_until?: string | null
          max_attempts?: number
          model?: string | null
          next_attempt_at?: string | null
          next_run_at?: string | null
          output_tokens?: number | null
          prompt_version?: string | null
          spec_id?: string
          status?: string
          updated_at?: string
          updated_fields?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tds_analysis_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "tds_analysis_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tds_analysis_items_spec_id_fkey"
            columns: ["spec_id"]
            isOneToOne: false
            referencedRelation: "master_specs"
            referencedColumns: ["id"]
          },
        ]
      }
      tds_extraction_cache: {
        Row: {
          created_at: string
          document_hash: string
          extracted: Json
          model: string
          object_etag: string | null
          prompt_version: string
        }
        Insert: {
          created_at?: string
          document_hash: string
          extracted: Json
          model: string
          object_etag?: string | null
          prompt_version: string
        }
        Update: {
          created_at?: string
          document_hash?: string
          extracted?: Json
          model?: string
          object_etag?: string | null
          prompt_version?: string
        }
        Relationships: []
      }
      tds_extraction_reservations: {
        Row: {
          created_at: string
          document_hash: string
          expires_at: string
          holder: string
          model: string
          prompt_version: string
        }
        Insert: {
          created_at?: string
          document_hash: string
          expires_at: string
          holder: string
          model: string
          prompt_version: string
        }
        Update: {
          created_at?: string
          document_hash?: string
          expires_at?: string
          holder?: string
          model?: string
          prompt_version?: string
        }
        Relationships: []
      }
      tds_extraction_runs: {
        Row: {
          cache_status: string | null
          cancelled: boolean
          cost_usd: number | null
          created_at: string
          document_hash: string | null
          error_class: string | null
          error_code: string | null
          id: string
          input_bytes: number | null
          input_tokens: number | null
          latency_ms: number | null
          model: string
          outcome: string
          output_tokens: number | null
          pages: number | null
          prompt_version: string | null
          route: string
          spec_id: string | null
        }
        Insert: {
          cache_status?: string | null
          cancelled?: boolean
          cost_usd?: number | null
          created_at?: string
          document_hash?: string | null
          error_class?: string | null
          error_code?: string | null
          id?: string
          input_bytes?: number | null
          input_tokens?: number | null
          latency_ms?: number | null
          model: string
          outcome: string
          output_tokens?: number | null
          pages?: number | null
          prompt_version?: string | null
          route: string
          spec_id?: string | null
        }
        Update: {
          cache_status?: string | null
          cancelled?: boolean
          cost_usd?: number | null
          created_at?: string
          document_hash?: string | null
          error_class?: string | null
          error_code?: string | null
          id?: string
          input_bytes?: number | null
          input_tokens?: number | null
          latency_ms?: number | null
          model?: string
          outcome?: string
          output_tokens?: number | null
          pages?: number | null
          prompt_version?: string | null
          route?: string
          spec_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tds_extraction_runs_spec_id_fkey"
            columns: ["spec_id"]
            isOneToOne: false
            referencedRelation: "master_specs"
            referencedColumns: ["id"]
          },
        ]
      }
      tds_field_provenance: {
        Row: {
          confidence: string | null
          created_at: string
          extracted_at: string
          field: string
          id: string
          model: string | null
          prompt_version: string | null
          source_page: number | null
          source_quote: string | null
          spec_id: string
          unit: string | null
          updated_at: string
          value_bool: boolean | null
          value_num: number | null
          value_text: string | null
        }
        Insert: {
          confidence?: string | null
          created_at?: string
          extracted_at?: string
          field: string
          id?: string
          model?: string | null
          prompt_version?: string | null
          source_page?: number | null
          source_quote?: string | null
          spec_id: string
          unit?: string | null
          updated_at?: string
          value_bool?: boolean | null
          value_num?: number | null
          value_text?: string | null
        }
        Update: {
          confidence?: string | null
          created_at?: string
          extracted_at?: string
          field?: string
          id?: string
          model?: string | null
          prompt_version?: string | null
          source_page?: number | null
          source_quote?: string | null
          spec_id?: string
          unit?: string | null
          updated_at?: string
          value_bool?: boolean | null
          value_num?: number | null
          value_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tds_field_provenance_spec_id_fkey"
            columns: ["spec_id"]
            isOneToOne: false
            referencedRelation: "master_specs"
            referencedColumns: ["id"]
          },
        ]
      }
      tds_provider_cooldowns: {
        Row: {
          cooldown_until: string
          model: string
          reason: string | null
          updated_at: string
        }
        Insert: {
          cooldown_until: string
          model: string
          reason?: string | null
          updated_at?: string
        }
        Update: {
          cooldown_until?: string
          model?: string
          reason?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      tds_worker_lease: {
        Row: {
          acquired_at: string
          expires_at: string
          holder: string
          key: string
        }
        Insert: {
          acquired_at?: string
          expires_at: string
          holder: string
          key: string
        }
        Update: {
          acquired_at?: string
          expires_at?: string
          holder?: string
          key?: string
        }
        Relationships: []
      }
      tds_worker_runs: {
        Row: {
          claimed: number
          ended_at: string | null
          error: string | null
          holder: string | null
          id: string
          pause_reason: string | null
          paused: boolean
          permanent: number
          retryable: number
          started_at: string
          success: number
        }
        Insert: {
          claimed?: number
          ended_at?: string | null
          error?: string | null
          holder?: string | null
          id?: string
          pause_reason?: string | null
          paused?: boolean
          permanent?: number
          retryable?: number
          started_at?: string
          success?: number
        }
        Update: {
          claimed?: number
          ended_at?: string | null
          error?: string | null
          holder?: string | null
          id?: string
          pause_reason?: string | null
          paused?: boolean
          permanent?: number
          retryable?: number
          started_at?: string
          success?: number
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
      widget_clients: {
        Row: {
          accent_color: string
          active: boolean
          api_key_hash: string
          api_key_prefix: string
          brand_name: string
          created_at: string
          created_by: string | null
          id: string
          last_used_at: string | null
          logo_url: string | null
          monthly_price_usd: number | null
          name: string
          notes: string | null
          subscription_renews_at: string | null
          subscription_started_at: string | null
          subscription_status: string
          updated_at: string
        }
        Insert: {
          accent_color?: string
          active?: boolean
          api_key_hash: string
          api_key_prefix: string
          brand_name: string
          created_at?: string
          created_by?: string | null
          id?: string
          last_used_at?: string | null
          logo_url?: string | null
          monthly_price_usd?: number | null
          name: string
          notes?: string | null
          subscription_renews_at?: string | null
          subscription_started_at?: string | null
          subscription_status?: string
          updated_at?: string
        }
        Update: {
          accent_color?: string
          active?: boolean
          api_key_hash?: string
          api_key_prefix?: string
          brand_name?: string
          created_at?: string
          created_by?: string | null
          id?: string
          last_used_at?: string | null
          logo_url?: string | null
          monthly_price_usd?: number | null
          name?: string
          notes?: string | null
          subscription_renews_at?: string | null
          subscription_started_at?: string | null
          subscription_status?: string
          updated_at?: string
        }
        Relationships: []
      }
      widget_usage_monthly: {
        Row: {
          client_id: string
          month: string
          request_count: number
        }
        Insert: {
          client_id: string
          month: string
          request_count?: number
        }
        Update: {
          client_id?: string
          month?: string
          request_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "widget_usage_monthly_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "widget_clients"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      ai_worker_allowed: {
        Args: never
        Returns: {
          allowed: boolean
          reason: string
        }[]
      }
      claim_tds_items: {
        Args: { _lease_seconds: number; _limit: number }
        Returns: {
          attempts: number
          batch_id: string
          client_request_id: string | null
          completed_at: string | null
          cost_usd: number | null
          created_at: string
          document_hash: string | null
          error: string | null
          error_class: string | null
          error_code: string | null
          id: string
          input_tokens: number | null
          last_error_at: string | null
          latency_ms: number | null
          lease_until: string | null
          max_attempts: number
          model: string | null
          next_attempt_at: string | null
          next_run_at: string | null
          output_tokens: number | null
          prompt_version: string | null
          spec_id: string
          status: string
          updated_at: string
          updated_fields: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "tds_analysis_items"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      finalize_stuck_batches: { Args: never; Returns: undefined }
      get_batch_health: { Args: { _batch_id: string }; Returns: Json }
      get_batch_status_summary: {
        Args: { _batch_id: string }
        Returns: {
          count: number
          status: string
        }[]
      }
      get_latest_spec_batch: { Args: { _spec_id: string }; Returns: string }
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
      pause_running_batches_cap: { Args: { _reason: string }; Returns: number }
      record_ai_usage: {
        Args: {
          _cost_usd: number
          _failed: boolean
          _input_tokens: number
          _model: string
          _output_tokens: number
        }
        Returns: undefined
      }
      recount_tds_batch: { Args: { _batch_id: string }; Returns: undefined }
      release_extraction_reservation: {
        Args: {
          _document_hash: string
          _holder: string
          _model: string
          _prompt_version: string
        }
        Returns: undefined
      }
      release_worker_lease: {
        Args: { _holder: string; _key: string }
        Returns: undefined
      }
      set_provider_cooldown: {
        Args: { _model: string; _reason: string; _seconds: number }
        Returns: string
      }
      stamp_first_login: { Args: { _user_id: string }; Returns: undefined }
      try_acquire_worker_lease: {
        Args: { _holder: string; _key: string; _ttl_seconds: number }
        Returns: boolean
      }
      try_reserve_extraction: {
        Args: {
          _document_hash: string
          _holder: string
          _model: string
          _prompt_version: string
          _ttl_seconds: number
        }
        Returns: boolean
      }
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
