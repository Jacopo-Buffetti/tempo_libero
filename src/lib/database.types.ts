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
          display_name: string | null
          org_id: string
          role: Database["public"]["Enums"]["member_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          org_id: string
          role?: Database["public"]["Enums"]["member_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
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
          name: string
          org_id: string
          paid_by: Database["public"]["Enums"]["payment_source"] | null
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
          name: string
          org_id: string
          paid_by?: Database["public"]["Enums"]["payment_source"] | null
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
          name?: string
          org_id?: string
          paid_by?: Database["public"]["Enums"]["payment_source"] | null
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
    }
    Views: {
      shopping_list_summary: {
        Row: {
          checked_count: number | null
          closed_at: string | null
          closed_on: string | null
          created_at: string | null
          event_id: string | null
          id: string | null
          items_count: number | null
          location: Database["public"]["Enums"]["item_location"] | null
          missing_prices: number | null
          name: string | null
          org_id: string | null
          paid_by: Database["public"]["Enums"]["payment_source"] | null
          paid_by_user: string | null
          reimbursed: boolean | null
          shop: string | null
          status: Database["public"]["Enums"]["list_status"] | null
          total_cents: number | null
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
        Args: {
          p_carry_over?: boolean
          p_closed_on: string
          p_list_id: string
          p_paid_by: Database["public"]["Enums"]["payment_source"]
          p_prices: Json
          p_shop: string
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
          p_location: Database["public"]["Enums"]["item_location"]
          p_name: string
          p_org_id: string
        }
        Returns: string
      }
      delete_dish: { Args: { p_dish_id: string }; Returns: undefined }
      delete_shopping_list: {
        Args: { p_list_id: string; p_revert?: boolean }
        Returns: undefined
      }
      ensure_event_list: { Args: { p_event_id: string }; Returns: string }
      import_items: { Args: { p_org_id: string; p_rows: Json }; Returns: Json }
      is_admin: { Args: { p_org: string }; Returns: boolean }
      is_member: { Args: { p_org: string }; Returns: boolean }
      list_open_in_org: {
        Args: { p_list: string; p_org: string }
        Returns: boolean
      }
      set_dish_ingredient_qty: {
        Args: { p_id: string; p_qty: number }
        Returns: undefined
      }
      set_list_item_checked: {
        Args: { p_checked: boolean; p_id: string }
        Returns: undefined
      }
      unit_factor: { Args: { p_unit: string }; Returns: number }
      unit_family: { Args: { p_unit: string }; Returns: string }
    }
    Enums: {
      item_kind: "consumabile" | "attrezzatura"
      item_location: "magazzino" | "cucina" | "bar"
      list_status: "aperta" | "chiusa"
      member_role: "admin" | "volontario"
      menu_price_mode: "per_piatto" | "fisso"
      payment_source: "cassa" | "volontario"
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
      member_role: ["admin", "volontario"],
      menu_price_mode: ["per_piatto", "fisso"],
      payment_source: ["cassa", "volontario"],
    },
  },
} as const
