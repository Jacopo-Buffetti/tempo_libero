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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      clients: {
        Row: {
          address: string | null
          birth_date: string | null
          birth_place: string | null
          created_at: string
          email: string | null
          first_name: string
          id: string
          last_name: string | null
          notes: string | null
          org_id: string
          phone: string | null
          tax_code: string | null
        }
        Insert: {
          address?: string | null
          birth_date?: string | null
          birth_place?: string | null
          created_at?: string
          email?: string | null
          first_name: string
          id?: string
          last_name?: string | null
          notes?: string | null
          org_id: string
          phone?: string | null
          tax_code?: string | null
        }
        Update: {
          address?: string | null
          birth_date?: string | null
          birth_place?: string | null
          created_at?: string
          email?: string | null
          first_name?: string
          id?: string
          last_name?: string | null
          notes?: string | null
          org_id?: string
          phone?: string | null
          tax_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      dish_ingredients: {
        Row: {
          dish_id: string
          id: string
          list_item_id: string
          org_id: string
          qty: number
        }
        Insert: {
          dish_id: string
          id?: string
          list_item_id: string
          org_id: string
          qty: number
        }
        Update: {
          dish_id?: string
          id?: string
          list_item_id?: string
          org_id?: string
          qty?: number
        }
        Relationships: [
          {
            foreignKeyName: "dish_ingredients_dish_id_fkey"
            columns: ["dish_id"]
            isOneToOne: false
            referencedRelation: "menu_dishes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dish_ingredients_list_item_id_fkey"
            columns: ["list_item_id"]
            isOneToOne: false
            referencedRelation: "shopping_list_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dish_ingredients_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          copied_from: string | null
          created_at: string
          created_by: string | null
          fixed_price_cents: number | null
          fixed_price_note: string | null
          id: string
          name: string
          notes: string | null
          org_id: string
          place: string | null
          poster_path: string | null
          price_mode: Database["public"]["Enums"]["menu_price_mode"]
          start_time: string | null
          starts_on: string
        }
        Insert: {
          copied_from?: string | null
          created_at?: string
          created_by?: string | null
          fixed_price_cents?: number | null
          fixed_price_note?: string | null
          id?: string
          name: string
          notes?: string | null
          org_id: string
          place?: string | null
          poster_path?: string | null
          price_mode?: Database["public"]["Enums"]["menu_price_mode"]
          start_time?: string | null
          starts_on: string
        }
        Update: {
          copied_from?: string | null
          created_at?: string
          created_by?: string | null
          fixed_price_cents?: number | null
          fixed_price_note?: string | null
          id?: string
          name?: string
          notes?: string | null
          org_id?: string
          place?: string | null
          poster_path?: string | null
          price_mode?: Database["public"]["Enums"]["menu_price_mode"]
          start_time?: string | null
          starts_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_copied_from_fkey"
            columns: ["copied_from"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      item_movements: {
        Row: {
          broken_delta: number
          created_at: string
          delta: number
          id: number
          item_id: string
          org_id: string
          reason: string | null
          user_id: string | null
        }
        Insert: {
          broken_delta?: number
          created_at?: string
          delta: number
          id?: never
          item_id: string
          org_id: string
          reason?: string | null
          user_id?: string | null
        }
        Update: {
          broken_delta?: number
          created_at?: string
          delta?: number
          id?: never
          item_id?: string
          org_id?: string
          reason?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "item_movements_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_movements_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      items: {
        Row: {
          barcode: string | null
          broken_qty: number
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["item_kind"]
          location: Database["public"]["Enums"]["item_location"]
          min_qty: number | null
          name: string
          org_id: string
          photo_path: string | null
          qty: number
          unit: string
          updated_at: string
        }
        Insert: {
          barcode?: string | null
          broken_qty?: number
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["item_kind"]
          location: Database["public"]["Enums"]["item_location"]
          min_qty?: number | null
          name: string
          org_id: string
          photo_path?: string | null
          qty?: number
          unit?: string
          updated_at?: string
        }
        Update: {
          barcode?: string | null
          broken_qty?: number
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["item_kind"]
          location?: Database["public"]["Enums"]["item_location"]
          min_qty?: number | null
          name?: string
          org_id?: string
          photo_path?: string | null
          qty?: number
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      members: {
        Row: {
          created_at: string
          created_by: string | null
          display_name: string | null
          email: string | null
          org_id: string
          role: Database["public"]["Enums"]["member_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          display_name?: string | null
          email?: string | null
          org_id: string
          role?: Database["public"]["Enums"]["member_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          display_name?: string | null
          email?: string | null
          org_id?: string
          role?: Database["public"]["Enums"]["member_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_dishes: {
        Row: {
          created_at: string
          description: string | null
          event_id: string
          id: string
          name: string
          org_id: string
          position: number
          price_cents: number | null
          section: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          event_id: string
          id?: string
          name: string
          org_id: string
          position?: number
          price_cents?: number | null
          section: string
        }
        Update: {
          created_at?: string
          description?: string | null
          event_id?: string
          id?: string
          name?: string
          org_id?: string
          position?: number
          price_cents?: number | null
          section?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_dishes_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_dishes_org_id_fkey"
            columns: ["org_id"]
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
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      payers: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          org_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          org_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_contracts: {
        Row: {
          contract: Json
          created_at: string
          created_by: string | null
          handover: Json
          id: string
          org_id: string
          rental_id: string
          seq: number
          updated_at: string
          year: number
        }
        Insert: {
          contract?: Json
          created_at?: string
          created_by?: string | null
          handover?: Json
          id?: string
          org_id: string
          rental_id: string
          seq: number
          updated_at?: string
          year: number
        }
        Update: {
          contract?: Json
          created_at?: string
          created_by?: string | null
          handover?: Json
          id?: string
          org_id?: string
          rental_id?: string
          seq?: number
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "rental_contracts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_contracts_rental_id_fkey"
            columns: ["rental_id"]
            isOneToOne: true
            referencedRelation: "rentals"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_documents: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          org_id: string
          path: string
          rental_id: string
          side: string
          size_bytes: number | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          org_id: string
          path: string
          rental_id: string
          side: string
          size_bytes?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          org_id?: string
          path?: string
          rental_id?: string
          side?: string
          size_bytes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "rental_documents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_documents_rental_id_fkey"
            columns: ["rental_id"]
            isOneToOne: false
            referencedRelation: "rentals"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_signed_files: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          kind: string
          mime: string
          org_id: string
          path: string
          rental_id: string
          size_bytes: number | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind: string
          mime: string
          org_id: string
          path: string
          rental_id: string
          size_bytes?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          mime?: string
          org_id?: string
          path?: string
          rental_id?: string
          size_bytes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "rental_signed_files_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_signed_files_rental_id_fkey"
            columns: ["rental_id"]
            isOneToOne: false
            referencedRelation: "rentals"
            referencedColumns: ["id"]
          },
        ]
      }
      rentals: {
        Row: {
          balance_paid: boolean
          client_id: string
          created_at: string
          created_by: string | null
          deposit_cents: number | null
          deposit_paid: boolean
          end_date: string
          end_time: string | null
          id: string
          notes: string | null
          org_id: string
          price_cents: number | null
          rent_date: string
          space: Database["public"]["Enums"]["rental_space"]
          start_time: string | null
        }
        Insert: {
          balance_paid?: boolean
          client_id: string
          created_at?: string
          created_by?: string | null
          deposit_cents?: number | null
          deposit_paid?: boolean
          end_date: string
          end_time?: string | null
          id?: string
          notes?: string | null
          org_id: string
          price_cents?: number | null
          rent_date: string
          space: Database["public"]["Enums"]["rental_space"]
          start_time?: string | null
        }
        Update: {
          balance_paid?: boolean
          client_id?: string
          created_at?: string
          created_by?: string | null
          deposit_cents?: number | null
          deposit_paid?: boolean
          end_date?: string
          end_time?: string | null
          id?: string
          notes?: string | null
          org_id?: string
          price_cents?: number | null
          rent_date?: string
          space?: Database["public"]["Enums"]["rental_space"]
          start_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rentals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rentals_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_people: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          nickname: string | null
          org_id: string
          position: number
          user_id: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          nickname?: string | null
          org_id: string
          position?: number
          user_id?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          nickname?: string | null
          org_id?: string
          position?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shift_people_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      shifts: {
        Row: {
          id: string
          org_id: string
          person_id: string
          shift_date: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: string
          org_id: string
          person_id: string
          shift_date: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: string
          org_id?: string
          person_id?: string
          shift_date?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shifts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "shift_people"
            referencedColumns: ["id"]
          },
        ]
      }
      shopping_list_items: {
        Row: {
          checked: boolean
          checked_at: string | null
          checked_by: string | null
          created_at: string
          id: string
          item_id: string | null
          list_id: string
          name: string
          note: string | null
          org_id: string
          price_cents: number | null
          qty: number
          run_id: string | null
          unit: string
        }
        Insert: {
          checked?: boolean
          checked_at?: string | null
          checked_by?: string | null
          created_at?: string
          id?: string
          item_id?: string | null
          list_id: string
          name: string
          note?: string | null
          org_id: string
          price_cents?: number | null
          qty?: number
          run_id?: string | null
          unit?: string
        }
        Update: {
          checked?: boolean
          checked_at?: string | null
          checked_by?: string | null
          created_at?: string
          id?: string
          item_id?: string | null
          list_id?: string
          name?: string
          note?: string | null
          org_id?: string
          price_cents?: number | null
          qty?: number
          run_id?: string | null
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "shopping_list_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_list_items_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "shopping_list_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_list_items_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "shopping_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_list_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_list_items_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "shopping_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      shopping_lists: {
        Row: {
          closed_at: string | null
          closed_on: string | null
          created_at: string
          created_by: string | null
          event_id: string | null
          id: string
          location: Database["public"]["Enums"]["item_location"]
          locations: Database["public"]["Enums"]["item_location"][]
          name: string
          org_id: string
          paid_by: Database["public"]["Enums"]["payment_source"] | null
          paid_by_name: string | null
          paid_by_person: string | null
          paid_by_user: string | null
          reimbursed: boolean
          shop: string | null
          status: Database["public"]["Enums"]["list_status"]
        }
        Insert: {
          closed_at?: string | null
          closed_on?: string | null
          created_at?: string
          created_by?: string | null
          event_id?: string | null
          id?: string
          location: Database["public"]["Enums"]["item_location"]
          locations?: Database["public"]["Enums"]["item_location"][]
          name: string
          org_id: string
          paid_by?: Database["public"]["Enums"]["payment_source"] | null
          paid_by_name?: string | null
          paid_by_person?: string | null
          paid_by_user?: string | null
          reimbursed?: boolean
          shop?: string | null
          status?: Database["public"]["Enums"]["list_status"]
        }
        Update: {
          closed_at?: string | null
          closed_on?: string | null
          created_at?: string
          created_by?: string | null
          event_id?: string | null
          id?: string
          location?: Database["public"]["Enums"]["item_location"]
          locations?: Database["public"]["Enums"]["item_location"][]
          name?: string
          org_id?: string
          paid_by?: Database["public"]["Enums"]["payment_source"] | null
          paid_by_name?: string | null
          paid_by_person?: string | null
          paid_by_user?: string | null
          reimbursed?: boolean
          shop?: string | null
          status?: Database["public"]["Enums"]["list_status"]
        }
        Relationships: [
          {
            foreignKeyName: "shopping_lists_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_lists_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      shopping_receipts: {
        Row: {
          created_at: string
          created_by: string | null
          error: string | null
          id: string
          list_id: string
          org_id: string
          path: string
          receipt_date: string | null
          run_id: string | null
          shop: string | null
          status: string
          total_cents: number | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          list_id: string
          org_id: string
          path: string
          receipt_date?: string | null
          run_id?: string | null
          shop?: string | null
          status?: string
          total_cents?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          list_id?: string
          org_id?: string
          path?: string
          receipt_date?: string | null
          run_id?: string | null
          shop?: string | null
          status?: string
          total_cents?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "shopping_receipts_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "shopping_list_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_receipts_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "shopping_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_receipts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_receipts_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "shopping_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      shopping_runs: {
        Row: {
          amount_cents: number | null
          created_at: string
          created_by: string | null
          id: string
          list_id: string
          org_id: string
          paid_by: Database["public"]["Enums"]["payment_source"]
          paid_by_name: string | null
          paid_by_person: string | null
          paid_by_user: string | null
          payer_id: string | null
          reimbursed: boolean
          reimbursed_on: string | null
          run_date: string
          shop: string | null
        }
        Insert: {
          amount_cents?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          list_id: string
          org_id: string
          paid_by?: Database["public"]["Enums"]["payment_source"]
          paid_by_name?: string | null
          paid_by_person?: string | null
          paid_by_user?: string | null
          payer_id?: string | null
          reimbursed?: boolean
          reimbursed_on?: string | null
          run_date?: string
          shop?: string | null
        }
        Update: {
          amount_cents?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          list_id?: string
          org_id?: string
          paid_by?: Database["public"]["Enums"]["payment_source"]
          paid_by_name?: string | null
          paid_by_person?: string | null
          paid_by_user?: string | null
          payer_id?: string | null
          reimbursed?: boolean
          reimbursed_on?: string | null
          run_date?: string
          shop?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shopping_runs_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "shopping_list_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_runs_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "shopping_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_runs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      shopping_list_summary: {
        Row: {
          amounts_missing: number | null
          checked_count: number | null
          closed_at: string | null
          closed_on: string | null
          created_at: string | null
          created_by: string | null
          event_id: string | null
          id: string | null
          items_count: number | null
          location: Database["public"]["Enums"]["item_location"] | null
          locations: Database["public"]["Enums"]["item_location"][] | null
          missing_prices: number | null
          name: string | null
          org_id: string | null
          paid_by: Database["public"]["Enums"]["payment_source"] | null
          paid_by_user: string | null
          receipts_cents: number | null
          receipts_count: number | null
          receipts_missing: number | null
          refund_cents: number | null
          reimbursed: boolean | null
          runs_count: number | null
          shop: string | null
          spent_cents: number | null
          status: Database["public"]["Enums"]["list_status"] | null
          total_cents: number | null
          unregistered_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "shopping_lists_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_lists_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      add_list_item: {
        Args: {
          p_dish_id?: string
          p_item_id?: string
          p_list_id: string
          p_name: string
          p_note?: string
          p_qty: number
          p_unit: string
        }
        Returns: string
      }
      adjust_broken: {
        Args: { p_delta: number; p_item_id: string; p_reason?: string }
        Returns: number
      }
      adjust_quantity: {
        Args: { p_delta: number; p_item_id: string; p_reason?: string }
        Returns: number
      }
      close_shopping_list: {
        Args: { p_carry_over?: boolean; p_list_id: string }
        Returns: string
      }
      create_payment: {
        Args: {
          p_amount_cents: number | null
          p_item_ids: string[]
          p_list_id: string
          p_paid_on: string | null
          p_payer_kind: string
          p_payer_name: string | null
          p_payer_ref: string | null
          p_shop: string | null
        }
        Returns: string
      }
      create_event: {
        Args: {
          p_copy_from?: string
          p_name: string
          p_org_id: string
          p_place?: string
          p_start_time?: string
          p_starts_on: string
        }
        Returns: string
      }
      create_shopping_list: {
        Args: {
          p_add_low?: boolean
          p_locations: Database["public"]["Enums"]["item_location"][]
          p_name: string
          p_org_id: string
        }
        Returns: string
      }
      delete_dish: { Args: { p_dish_id: string }; Returns: undefined }
      delete_payment: { Args: { p_id: string }; Returns: undefined }
      delete_shopping_list: {
        Args: { p_list_id: string; p_revert?: boolean }
        Returns: undefined
      }
      ensure_event_list: { Args: { p_event_id: string }; Returns: string }
      ensure_rental_contract: { Args: { p_rental_id: string }; Returns: string }
      import_items: { Args: { p_org_id: string; p_rows: Json }; Returns: Json }
      is_admin: { Args: { p_org: string }; Returns: boolean }
      is_consigliere: { Args: { p_org: string }; Returns: boolean }
      is_member: { Args: { p_org: string }; Returns: boolean }
      list_open_in_org: {
        Args: { p_list: string; p_org: string }
        Returns: boolean
      }
      payer_options: {
        Args: { p_org: string }
        Returns: {
          id: string
          kind: string
          name: string
          user_id: string | null
        }[]
      }
      run_total: { Args: { p_run_id: string }; Returns: number }
      set_dish_ingredient_qty: {
        Args: { p_id: string; p_qty: number }
        Returns: undefined
      }
      set_payments_reimbursed: {
        Args: { p_ids: string[]; p_value: boolean }
        Returns: number
      }
      set_list_item_checked: {
        Args: { p_checked: boolean; p_id: string }
        Returns: undefined
      }
      swap_shifts: {
        Args: { p_first: string; p_second: string }
        Returns: undefined
      }
      update_payment: {
        Args: {
          p_amount_cents: number | null
          p_id: string
          p_item_ids: string[] | null
          p_paid_on: string | null
          p_payer_kind: string
          p_payer_name: string | null
          p_payer_ref: string | null
          p_shop: string | null
        }
        Returns: undefined
      }
      unit_factor: { Args: { p_unit: string }; Returns: number }
      unit_family: { Args: { p_unit: string }; Returns: string }
      user_id_by_email: { Args: { p_email: string }; Returns: string }
    }
    Enums: {
      item_kind: "consumabile" | "attrezzatura"
      item_location: "magazzino" | "cucina" | "bar"
      list_status: "aperta" | "chiusa"
      member_role: "admin" | "volontario" | "consigliere"
      menu_price_mode: "per_piatto" | "fisso"
      payment_source: "cassa" | "volontario"
      rental_space: "stanza" | "cramaccioli"
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
    Enums: {
      item_kind: ["consumabile", "attrezzatura"],
      item_location: ["magazzino", "cucina", "bar"],
      list_status: ["aperta", "chiusa"],
      member_role: ["admin", "volontario", "consigliere"],
      menu_price_mode: ["per_piatto", "fisso"],
      payment_source: ["cassa", "volontario"],
      rental_space: ["stanza", "cramaccioli"],
    },
  },
} as const
