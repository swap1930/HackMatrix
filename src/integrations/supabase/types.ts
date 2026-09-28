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
      assignments: {
        Row: {
          created_at: string
          data_age_seconds: number | null
          eta_minutes: number | null
          expires_at: string | null
          hospital_id: string
          id: string
          idempotency_key: string | null
          rank_score: number | null
          reject_reason: string | null
          request_id: string
          reserved_resources: Json
          responded_at: string | null
          status: Database["public"]["Enums"]["assignment_status"]
        }
        Insert: {
          created_at?: string
          data_age_seconds?: number | null
          eta_minutes?: number | null
          expires_at?: string | null
          hospital_id: string
          id?: string
          idempotency_key?: string | null
          rank_score?: number | null
          reject_reason?: string | null
          request_id: string
          reserved_resources?: Json
          responded_at?: string | null
          status?: Database["public"]["Enums"]["assignment_status"]
        }
        Update: {
          created_at?: string
          data_age_seconds?: number | null
          eta_minutes?: number | null
          expires_at?: string | null
          hospital_id?: string
          id?: string
          idempotency_key?: string | null
          rank_score?: number | null
          reject_reason?: string | null
          request_id?: string
          reserved_resources?: Json
          responded_at?: string | null
          status?: Database["public"]["Enums"]["assignment_status"]
        }
        Relationships: [
          {
            foreignKeyName: "assignments_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "emergency_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      emergency_requests: {
        Row: {
          ambulance_id: string
          chief_complaint: string
          created_at: string
          created_by: string
          id: string
          needs_er: boolean
          needs_icu: boolean
          needs_ot: boolean
          needs_ventilator: boolean
          patient_age: number | null
          patient_sex: string | null
          pickup_lat: number
          pickup_lng: number
          required_capabilities: string[]
          severity: Database["public"]["Enums"]["severity_level"]
          status: Database["public"]["Enums"]["request_status"]
        }
        Insert: {
          ambulance_id?: string
          chief_complaint: string
          created_at?: string
          created_by?: string
          id?: string
          needs_er?: boolean
          needs_icu?: boolean
          needs_ot?: boolean
          needs_ventilator?: boolean
          patient_age?: number | null
          patient_sex?: string | null
          pickup_lat: number
          pickup_lng: number
          required_capabilities?: string[]
          severity?: Database["public"]["Enums"]["severity_level"]
          status?: Database["public"]["Enums"]["request_status"]
        }
        Update: {
          ambulance_id?: string
          chief_complaint?: string
          created_at?: string
          created_by?: string
          id?: string
          needs_er?: boolean
          needs_icu?: boolean
          needs_ot?: boolean
          needs_ventilator?: boolean
          patient_age?: number | null
          patient_sex?: string | null
          pickup_lat?: number
          pickup_lng?: number
          required_capabilities?: string[]
          severity?: Database["public"]["Enums"]["severity_level"]
          status?: Database["public"]["Enums"]["request_status"]
        }
        Relationships: []
      }
      handoff_briefs: {
        Row: {
          content: string
          created_at: string
          generated_by: string
          id: string
          request_id: string
        }
        Insert: {
          content: string
          created_at?: string
          generated_by?: string
          id?: string
          request_id: string
        }
        Update: {
          content?: string
          created_at?: string
          generated_by?: string
          id?: string
          request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "handoff_briefs_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "emergency_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      handoff_events: {
        Row: {
          actor_id: string | null
          assignment_id: string | null
          created_at: string
          event_type: string
          id: string
          note: string | null
          request_id: string
        }
        Insert: {
          actor_id?: string | null
          assignment_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          note?: string | null
          request_id: string
        }
        Update: {
          actor_id?: string | null
          assignment_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          note?: string | null
          request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "handoff_events_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "handoff_events_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "emergency_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      hospital_availability: {
        Row: {
          er_beds: number
          hospital_id: string
          icu_beds: number
          ot_available: number
          reserved_er: number
          reserved_icu: number
          reserved_ot: number
          reserved_ventilators: number
          updated_at: string
          ventilators: number
          version: number
        }
        Insert: {
          er_beds?: number
          hospital_id: string
          icu_beds?: number
          ot_available?: number
          reserved_er?: number
          reserved_icu?: number
          reserved_ot?: number
          reserved_ventilators?: number
          updated_at?: string
          ventilators?: number
          version?: number
        }
        Update: {
          er_beds?: number
          hospital_id?: string
          icu_beds?: number
          ot_available?: number
          reserved_er?: number
          reserved_icu?: number
          reserved_ot?: number
          reserved_ventilators?: number
          updated_at?: string
          ventilators?: number
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "hospital_availability_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: true
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
        ]
      }
      hospitals: {
        Row: {
          address: string
          capabilities: string[]
          created_at: string
          id: string
          lat: number
          lng: number
          name: string
          phone: string
        }
        Insert: {
          address?: string
          capabilities?: string[]
          created_at?: string
          id?: string
          lat: number
          lng: number
          name: string
          phone?: string
        }
        Update: {
          address?: string
          capabilities?: string[]
          created_at?: string
          id?: string
          lat?: number
          lng?: number
          name?: string
          phone?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          id: string
          read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string
          created_at?: string
          id?: string
          read?: boolean
          title: string
          type?: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string
          high_contrast: boolean
          hospital_id: string | null
          id: string
          language: string
          sound_enabled: boolean
          theme_preference: string
        }
        Insert: {
          created_at?: string
          full_name?: string
          high_contrast?: boolean
          hospital_id?: string | null
          id: string
          language?: string
          sound_enabled?: boolean
          theme_preference?: string
        }
        Update: {
          created_at?: string
          full_name?: string
          high_contrast?: boolean
          hospital_id?: string | null
          id?: string
          language?: string
          sound_enabled?: boolean
          theme_preference?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
        ]
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      expire_stale_assignments: { Args: never; Returns: number }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      my_hospital_id: { Args: never; Returns: string }
      release_assignment: {
        Args: {
          p_assignment_id: string
          p_new_status?: Database["public"]["Enums"]["assignment_status"]
          p_reason?: string
        }
        Returns: {
          created_at: string
          data_age_seconds: number | null
          eta_minutes: number | null
          expires_at: string | null
          hospital_id: string
          id: string
          idempotency_key: string | null
          rank_score: number | null
          reject_reason: string | null
          request_id: string
          reserved_resources: Json
          responded_at: string | null
          status: Database["public"]["Enums"]["assignment_status"]
        }
        SetofOptions: {
          from: "*"
          to: "assignments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reserve_hospital_resources: {
        Args: {
          p_hospital_id: string
          p_idempotency_key: string
          p_needs: Json
          p_request_id: string
        }
        Returns: {
          created_at: string
          data_age_seconds: number | null
          eta_minutes: number | null
          expires_at: string | null
          hospital_id: string
          id: string
          idempotency_key: string | null
          rank_score: number | null
          reject_reason: string | null
          request_id: string
          reserved_resources: Json
          responded_at: string | null
          status: Database["public"]["Enums"]["assignment_status"]
        }
        SetofOptions: {
          from: "*"
          to: "assignments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      respond_to_assignment: {
        Args: { p_action: string; p_assignment_id: string; p_reason?: string }
        Returns: {
          created_at: string
          data_age_seconds: number | null
          eta_minutes: number | null
          expires_at: string | null
          hospital_id: string
          id: string
          idempotency_key: string | null
          rank_score: number | null
          reject_reason: string | null
          request_id: string
          reserved_resources: Json
          responded_at: string | null
          status: Database["public"]["Enums"]["assignment_status"]
        }
        SetofOptions: {
          from: "*"
          to: "assignments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      app_role: "dispatcher" | "hospital_staff" | "admin"
      assignment_status:
        | "pending"
        | "accepted"
        | "rejected"
        | "expired"
        | "released"
        | "completed"
      request_status:
        | "new"
        | "pending_confirmation"
        | "accepted"
        | "en_route"
        | "arrived"
        | "handed_over"
        | "cancelled"
        | "expired"
      severity_level: "critical" | "serious" | "stable"
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
      app_role: ["dispatcher", "hospital_staff", "admin"],
      assignment_status: [
        "pending",
        "accepted",
        "rejected",
        "expired",
        "released",
        "completed",
      ],
      request_status: [
        "new",
        "pending_confirmation",
        "accepted",
        "en_route",
        "arrived",
        "handed_over",
        "cancelled",
        "expired",
      ],
      severity_level: ["critical", "serious", "stable"],
    },
  },
} as const
