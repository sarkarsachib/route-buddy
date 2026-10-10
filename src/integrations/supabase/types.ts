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
      app_config: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          details: Json
          entity_id: string | null
          entity_type: string
          id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          entity_id?: string | null
          entity_type: string
          id?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          entity_id?: string | null
          entity_type?: string
          id?: string
        }
        Relationships: []
      }
      booking_events: {
        Row: {
          actor_id: string | null
          actor_role: string
          booking_id: string
          created_at: string
          from_state: Database["public"]["Enums"]["booking_state"] | null
          id: string
          reason: string | null
          to_state: Database["public"]["Enums"]["booking_state"]
        }
        Insert: {
          actor_id?: string | null
          actor_role: string
          booking_id: string
          created_at?: string
          from_state?: Database["public"]["Enums"]["booking_state"] | null
          id?: string
          reason?: string | null
          to_state: Database["public"]["Enums"]["booking_state"]
        }
        Update: {
          actor_id?: string | null
          actor_role?: string
          booking_id?: string
          created_at?: string
          from_state?: Database["public"]["Enums"]["booking_state"] | null
          id?: string
          reason?: string | null
          to_state?: Database["public"]["Enums"]["booking_state"]
        }
        Relationships: [
          {
            foreignKeyName: "booking_events_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          accessibility: Json
          arrived_at: string | null
          category_preference: string | null
          confirmed_fare_ceiling: number
          created_at: string
          current_guaranteed_payable: number
          dropoff_label: string
          dropoff_lat: number
          dropoff_lng: number
          final_fare: number | null
          id: string
          idempotency_key: string
          is_demo: boolean
          language_preference: string | null
          max_detour_pct: number
          passenger_count: number
          passenger_id: string
          payment_method: string
          pickup_label: string
          pickup_lat: number
          pickup_lng: number
          private_reference_fare: number
          quote_id: string
          ride_mode: Database["public"]["Enums"]["ride_mode"]
          share_token: string | null
          solo_distance_m: number
          state: Database["public"]["Enums"]["booking_state"]
          updated_at: string
          vehicle_type: string
          version: number
          window_end: string
          window_start: string
        }
        Insert: {
          accessibility?: Json
          arrived_at?: string | null
          category_preference?: string | null
          confirmed_fare_ceiling: number
          created_at?: string
          current_guaranteed_payable: number
          dropoff_label: string
          dropoff_lat: number
          dropoff_lng: number
          final_fare?: number | null
          id?: string
          idempotency_key: string
          is_demo?: boolean
          language_preference?: string | null
          max_detour_pct?: number
          passenger_count: number
          passenger_id: string
          payment_method?: string
          pickup_label: string
          pickup_lat: number
          pickup_lng: number
          private_reference_fare: number
          quote_id: string
          ride_mode: Database["public"]["Enums"]["ride_mode"]
          share_token?: string | null
          solo_distance_m: number
          state?: Database["public"]["Enums"]["booking_state"]
          updated_at?: string
          vehicle_type?: string
          version?: number
          window_end: string
          window_start: string
        }
        Update: {
          accessibility?: Json
          arrived_at?: string | null
          category_preference?: string | null
          confirmed_fare_ceiling?: number
          created_at?: string
          current_guaranteed_payable?: number
          dropoff_label?: string
          dropoff_lat?: number
          dropoff_lng?: number
          final_fare?: number | null
          id?: string
          idempotency_key?: string
          is_demo?: boolean
          language_preference?: string | null
          max_detour_pct?: number
          passenger_count?: number
          passenger_id?: string
          payment_method?: string
          pickup_label?: string
          pickup_lat?: number
          pickup_lng?: number
          private_reference_fare?: number
          quote_id?: string
          ride_mode?: Database["public"]["Enums"]["ride_mode"]
          share_token?: string | null
          solo_distance_m?: number
          state?: Database["public"]["Enums"]["booking_state"]
          updated_at?: string
          vehicle_type?: string
          version?: number
          window_end?: string
          window_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: true
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      category_rules: {
        Row: {
          code: string
          description: string
          label: string
          status: string
          updated_at: string
        }
        Insert: {
          code: string
          description: string
          label: string
          status?: string
          updated_at?: string
        }
        Update: {
          code?: string
          description?: string
          label?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      driver_payout_ledger: {
        Row: {
          amount_paise: number
          booking_id: string | null
          created_at: string
          driver_id: string
          entry_type: string
          id: string
          reason: string | null
          settlement_id: string | null
          trip_id: string | null
        }
        Insert: {
          amount_paise: number
          booking_id?: string | null
          created_at?: string
          driver_id: string
          entry_type: string
          id?: string
          reason?: string | null
          settlement_id?: string | null
          trip_id?: string | null
        }
        Update: {
          amount_paise?: number
          booking_id?: string | null
          created_at?: string
          driver_id?: string
          entry_type?: string
          id?: string
          reason?: string | null
          settlement_id?: string | null
          trip_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "driver_payout_ledger_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_payout_ledger_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "driver_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_payout_ledger_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "settlements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_payout_ledger_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_profiles: {
        Row: {
          availability_status: string
          created_at: string
          current_lat: number | null
          current_lng: number | null
          display_name: string
          id: string
          is_demo: boolean
          location_updated_at: string | null
          rating_avg: number | null
          rating_count: number
          restricted_until: string | null
          restriction_reason: string | null
          user_id: string | null
          verification_status: string
        }
        Insert: {
          availability_status?: string
          created_at?: string
          current_lat?: number | null
          current_lng?: number | null
          display_name: string
          id?: string
          is_demo?: boolean
          location_updated_at?: string | null
          rating_avg?: number | null
          rating_count?: number
          restricted_until?: string | null
          restriction_reason?: string | null
          user_id?: string | null
          verification_status?: string
        }
        Update: {
          availability_status?: string
          created_at?: string
          current_lat?: number | null
          current_lng?: number | null
          display_name?: string
          id?: string
          is_demo?: boolean
          location_updated_at?: string | null
          rating_avg?: number | null
          rating_count?: number
          restricted_until?: string | null
          restriction_reason?: string | null
          user_id?: string | null
          verification_status?: string
        }
        Relationships: []
      }
      fare_allocations: {
        Row: {
          allocation_method: string
          booking_id: string
          created_at: string
          final_amount: number | null
          guaranteed_amount: number
          id: string
          pricing_version: string
          quoted_amount: number
          snapshot: Json
          trip_id: string | null
        }
        Insert: {
          allocation_method: string
          booking_id: string
          created_at?: string
          final_amount?: number | null
          guaranteed_amount: number
          id?: string
          pricing_version: string
          quoted_amount: number
          snapshot: Json
          trip_id?: string | null
        }
        Update: {
          allocation_method?: string
          booking_id?: string
          created_at?: string
          final_amount?: number | null
          guaranteed_amount?: number
          id?: string
          pricing_version?: string
          quoted_amount?: number
          snapshot?: Json
          trip_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fare_allocations_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fare_allocations_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      fare_ledger: {
        Row: {
          amount_paise: number
          booking_id: string
          created_at: string
          created_by: string | null
          entry_type: string
          id: string
          reason: string | null
          reference: string | null
        }
        Insert: {
          amount_paise: number
          booking_id: string
          created_at?: string
          created_by?: string | null
          entry_type: string
          id?: string
          reason?: string | null
          reference?: string | null
        }
        Update: {
          amount_paise?: number
          booking_id?: string
          created_at?: string
          created_by?: string | null
          entry_type?: string
          id?: string
          reason?: string | null
          reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fare_ledger_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      incident_actions: {
        Row: {
          action: string
          actor_id: string
          created_at: string
          id: string
          incident_id: string
          notes: string | null
        }
        Insert: {
          action: string
          actor_id: string
          created_at?: string
          id?: string
          incident_id: string
          notes?: string | null
        }
        Update: {
          action?: string
          actor_id?: string
          created_at?: string
          id?: string
          incident_id?: string
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "incident_actions_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "safety_incidents"
            referencedColumns: ["id"]
          },
        ]
      }
      negotiation_offers: {
        Row: {
          amount_paise: number
          booking_id: string
          created_at: string
          created_by: string | null
          driver_id: string | null
          expires_at: string
          id: string
          parent_offer_id: string | null
          party: string
          status: string
        }
        Insert: {
          amount_paise: number
          booking_id: string
          created_at?: string
          created_by?: string | null
          driver_id?: string | null
          expires_at: string
          id?: string
          parent_offer_id?: string | null
          party: string
          status?: string
        }
        Update: {
          amount_paise?: number
          booking_id?: string
          created_at?: string
          created_by?: string | null
          driver_id?: string | null
          expires_at?: string
          id?: string
          parent_offer_id?: string | null
          party?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "negotiation_offers_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "negotiation_offers_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "driver_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "negotiation_offers_parent_offer_id_fkey"
            columns: ["parent_offer_id"]
            isOneToOne: false
            referencedRelation: "negotiation_offers"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          channel: string
          created_at: string
          delivery_status: string
          id: string
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body: string
          channel?: string
          created_at?: string
          delivery_status?: string
          id?: string
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string
          channel?: string
          created_at?: string
          delivery_status?: string
          id?: string
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      passenger_profiles: {
        Row: {
          accessibility_needs: string[]
          notification_prefs: Json
          trusted_contact_name: string | null
          trusted_contact_phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          accessibility_needs?: string[]
          notification_prefs?: Json
          trusted_contact_name?: string | null
          trusted_contact_phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          accessibility_needs?: string[]
          notification_prefs?: Json
          trusted_contact_name?: string | null
          trusted_contact_phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "passenger_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_records: {
        Row: {
          amount_paise: number
          booking_id: string
          created_at: string
          id: string
          idempotency_key: string
          method: string
          provider: string
          provider_reference: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount_paise: number
          booking_id: string
          created_at?: string
          id?: string
          idempotency_key: string
          method: string
          provider: string
          provider_reference?: string | null
          status: string
          updated_at?: string
        }
        Update: {
          amount_paise?: number
          booking_id?: string
          created_at?: string
          id?: string
          idempotency_key?: string
          method?: string
          provider?: string
          provider_reference?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_records_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_webhook_events: {
        Row: {
          created_at: string
          id: string
          outcome: string | null
          payload: Json
          provider: string
          provider_event_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          outcome?: string | null
          payload: Json
          provider: string
          provider_event_id: string
        }
        Update: {
          created_at?: string
          id?: string
          outcome?: string | null
          payload?: Json
          provider?: string
          provider_event_id?: string
        }
        Relationships: []
      }
      pricing_versions: {
        Row: {
          business_approved: boolean
          config: Json
          created_at: string
          created_by: string | null
          id: string
          status: string
          version: string
        }
        Insert: {
          business_approved?: boolean
          config: Json
          created_at?: string
          created_by?: string | null
          id?: string
          status?: string
          version: string
        }
        Update: {
          business_approved?: boolean
          config?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          status?: string
          version?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          account_status: string
          created_at: string
          display_name: string | null
          id: string
          phone: string | null
          preferred_language: string
          updated_at: string
        }
        Insert: {
          account_status?: string
          created_at?: string
          display_name?: string | null
          id: string
          phone?: string | null
          preferred_language?: string
          updated_at?: string
        }
        Update: {
          account_status?: string
          created_at?: string
          display_name?: string | null
          id?: string
          phone?: string | null
          preferred_language?: string
          updated_at?: string
        }
        Relationships: []
      }
      quotes: {
        Row: {
          budget_paise: number | null
          calculation: Json
          created_at: string
          current_guaranteed_payable: number
          distance_m: number
          dropoff_label: string
          dropoff_lat: number
          dropoff_lng: number
          duration_s: number
          expires_at: string
          guaranteed_discount: number
          id: string
          initial_fare_ceiling: number
          passenger_count: number
          passenger_id: string
          pickup_label: string
          pickup_lat: number
          pickup_lng: number
          potential_additional_discount: number
          pricing_version: string
          private_reference_fare: number
          ride_mode: Database["public"]["Enums"]["ride_mode"]
          routing_provider: string
          shared_trip_id: string | null
          vehicle_type: string
        }
        Insert: {
          budget_paise?: number | null
          calculation: Json
          created_at?: string
          current_guaranteed_payable: number
          distance_m: number
          dropoff_label: string
          dropoff_lat: number
          dropoff_lng: number
          duration_s: number
          expires_at: string
          guaranteed_discount?: number
          id?: string
          initial_fare_ceiling: number
          passenger_count: number
          passenger_id: string
          pickup_label: string
          pickup_lat: number
          pickup_lng: number
          potential_additional_discount?: number
          pricing_version: string
          private_reference_fare: number
          ride_mode: Database["public"]["Enums"]["ride_mode"]
          routing_provider: string
          shared_trip_id?: string | null
          vehicle_type?: string
        }
        Update: {
          budget_paise?: number | null
          calculation?: Json
          created_at?: string
          current_guaranteed_payable?: number
          distance_m?: number
          dropoff_label?: string
          dropoff_lat?: number
          dropoff_lng?: number
          duration_s?: number
          expires_at?: string
          guaranteed_discount?: number
          id?: string
          initial_fare_ceiling?: number
          passenger_count?: number
          passenger_id?: string
          pickup_label?: string
          pickup_lat?: number
          pickup_lng?: number
          potential_additional_discount?: number
          pricing_version?: string
          private_reference_fare?: number
          ride_mode?: Database["public"]["Enums"]["ride_mode"]
          routing_provider?: string
          shared_trip_id?: string | null
          vehicle_type?: string
        }
        Relationships: []
      }
      refunds: {
        Row: {
          amount_paise: number
          booking_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          payment_id: string | null
          reason: string
          requested_by: string | null
          status: string
        }
        Insert: {
          amount_paise: number
          booking_id: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          payment_id?: string | null
          reason: string
          requested_by?: string | null
          status?: string
        }
        Update: {
          amount_paise?: number
          booking_id?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          payment_id?: string | null
          reason?: string
          requested_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "refunds_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payment_records"
            referencedColumns: ["id"]
          },
        ]
      }
      safety_incidents: {
        Row: {
          assigned_to: string | null
          booking_id: string | null
          category: string
          created_at: string
          description: string
          evidence_refs: string[]
          id: string
          reporter_id: string
          reporter_role: string
          severity: string
          status: string
          subject_driver_id: string | null
          trip_id: string | null
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          booking_id?: string | null
          category: string
          created_at?: string
          description: string
          evidence_refs?: string[]
          id?: string
          reporter_id: string
          reporter_role: string
          severity?: string
          status?: string
          subject_driver_id?: string | null
          trip_id?: string | null
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          booking_id?: string | null
          category?: string
          created_at?: string
          description?: string
          evidence_refs?: string[]
          id?: string
          reporter_id?: string
          reporter_role?: string
          severity?: string
          status?: string
          subject_driver_id?: string | null
          trip_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "safety_incidents_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "safety_incidents_subject_driver_id_fkey"
            columns: ["subject_driver_id"]
            isOneToOne: false
            referencedRelation: "driver_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "safety_incidents_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      service_areas: {
        Row: {
          config: Json
          created_at: string
          id: string
          name: string
          status: string
        }
        Insert: {
          config: Json
          created_at?: string
          id?: string
          name: string
          status?: string
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          name?: string
          status?: string
        }
        Relationships: []
      }
      settlements: {
        Row: {
          cash_collected: number
          created_at: string
          created_by: string | null
          driver_id: string
          gross_payout: number
          id: string
          net_due: number
          period_end: string
          period_start: string
          status: string
        }
        Insert: {
          cash_collected: number
          created_at?: string
          created_by?: string | null
          driver_id: string
          gross_payout: number
          id?: string
          net_due: number
          period_end: string
          period_start: string
          status?: string
        }
        Update: {
          cash_collected?: number
          created_at?: string
          created_by?: string | null
          driver_id?: string
          gross_payout?: number
          id?: string
          net_due?: number
          period_end?: string
          period_start?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "settlements_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "driver_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      support_cases: {
        Row: {
          assigned_to: string | null
          booking_id: string | null
          category: string
          created_at: string
          description: string
          id: string
          opened_by: string
          status: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          booking_id?: string | null
          category: string
          created_at?: string
          description: string
          id?: string
          opened_by: string
          status?: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          booking_id?: string | null
          category?: string
          created_at?: string
          description?: string
          id?: string
          opened_by?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_cases_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_bookings: {
        Row: {
          assignment_state: string
          booking_id: string
          created_at: string
          dropoff_seq: number
          id: string
          pickup_seq: number
          proposal_expires_at: string | null
          trip_id: string
        }
        Insert: {
          assignment_state?: string
          booking_id: string
          created_at?: string
          dropoff_seq: number
          id?: string
          pickup_seq: number
          proposal_expires_at?: string | null
          trip_id: string
        }
        Update: {
          assignment_state?: string
          booking_id?: string
          created_at?: string
          dropoff_seq?: number
          id?: string
          pickup_seq?: number
          proposal_expires_at?: string | null
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_bookings_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_bookings_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_events: {
        Row: {
          actor_id: string | null
          booking_id: string | null
          created_at: string
          event_type: string
          id: string
          payload: Json
          trip_id: string | null
        }
        Insert: {
          actor_id?: string | null
          booking_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          payload?: Json
          trip_id?: string | null
        }
        Update: {
          actor_id?: string | null
          booking_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json
          trip_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trip_events_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_events_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_stops: {
        Row: {
          actual_arrival: string | null
          booking_id: string
          created_at: string
          id: string
          label: string
          lat: number
          lng: number
          planned_arrival: string | null
          seq: number
          status: string
          stop_type: string
          trip_id: string
        }
        Insert: {
          actual_arrival?: string | null
          booking_id: string
          created_at?: string
          id?: string
          label: string
          lat: number
          lng: number
          planned_arrival?: string | null
          seq: number
          status?: string
          stop_type: string
          trip_id: string
        }
        Update: {
          actual_arrival?: string | null
          booking_id?: string
          created_at?: string
          id?: string
          label?: string
          lat?: number
          lng?: number
          planned_arrival?: string | null
          seq?: number
          status?: string
          stop_type?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_stops_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_stops_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trips: {
        Row: {
          category: string | null
          completed_at: string | null
          created_at: string
          driver_id: string
          id: string
          is_demo: boolean
          is_shared: boolean
          planned_distance_m: number | null
          planned_duration_s: number | null
          planned_start: string
          route: Json
          started_at: string | null
          state: Database["public"]["Enums"]["trip_state"]
          vehicle_id: string
          version: number
        }
        Insert: {
          category?: string | null
          completed_at?: string | null
          created_at?: string
          driver_id: string
          id?: string
          is_demo?: boolean
          is_shared: boolean
          planned_distance_m?: number | null
          planned_duration_s?: number | null
          planned_start?: string
          route?: Json
          started_at?: string | null
          state?: Database["public"]["Enums"]["trip_state"]
          vehicle_id: string
          version?: number
        }
        Update: {
          category?: string | null
          completed_at?: string | null
          created_at?: string
          driver_id?: string
          id?: string
          is_demo?: boolean
          is_shared?: boolean
          planned_distance_m?: number | null
          planned_duration_s?: number | null
          planned_start?: string
          route?: Json
          started_at?: string | null
          state?: Database["public"]["Enums"]["trip_state"]
          vehicle_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "trips_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "driver_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          granted_by: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_by?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          granted_by?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vehicles: {
        Row: {
          created_at: string
          driver_id: string
          id: string
          is_active: boolean
          is_demo: boolean
          registration_ref: string
          seating_capacity: number
          vehicle_type: string
          verification_status: string
        }
        Insert: {
          created_at?: string
          driver_id: string
          id?: string
          is_active?: boolean
          is_demo?: boolean
          registration_ref: string
          seating_capacity: number
          vehicle_type: string
          verification_status?: string
        }
        Update: {
          created_at?: string
          driver_id?: string
          id?: string
          is_active?: boolean
          is_demo?: boolean
          registration_ref?: string
          seating_capacity?: number
          vehicle_type?: string
          verification_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "driver_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      verification_records: {
        Row: {
          created_at: string
          document_ref: string | null
          expires_at: string | null
          id: string
          notes: string | null
          record_type: string
          reviewed_by: string | null
          status: string
          subject_id: string
          subject_type: string
          verified_at: string | null
        }
        Insert: {
          created_at?: string
          document_ref?: string | null
          expires_at?: string | null
          id?: string
          notes?: string | null
          record_type: string
          reviewed_by?: string | null
          status?: string
          subject_id: string
          subject_type: string
          verified_at?: string | null
        }
        Update: {
          created_at?: string
          document_ref?: string | null
          expires_at?: string | null
          id?: string
          notes?: string | null
          record_type?: string
          reviewed_by?: string | null
          status?: string
          subject_id?: string
          subject_type?: string
          verified_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_any_role: {
        Args: {
          _roles: Database["public"]["Enums"]["app_role"][]
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      my_driver_id: { Args: never; Returns: string }
      owns_booking: { Args: { _booking: string }; Returns: boolean }
    }
    Enums: {
      app_role:
        | "passenger"
        | "driver"
        | "ops_agent"
        | "safety_reviewer"
        | "finance"
        | "admin"
      booking_state:
        | "DRAFT"
        | "QUOTED"
        | "SEARCHING"
        | "MATCH_PROPOSED"
        | "MATCH_CONFIRMED"
        | "DRIVER_EN_ROUTE"
        | "DRIVER_ARRIVED"
        | "PASSENGER_ONBOARD"
        | "IN_PROGRESS"
        | "COMPLETED"
        | "CANCELLED"
        | "EXPIRED"
        | "SUPPORT_REVIEW"
      ride_mode:
        | "PRIVATE"
        | "SHARE_AND_SAVE"
        | "SHARED_NOW"
        | "BUDGET"
        | "GROUP_PRIVATE"
      trip_state:
        | "planned"
        | "driver_en_route"
        | "in_progress"
        | "completed"
        | "cancelled"
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
      app_role: [
        "passenger",
        "driver",
        "ops_agent",
        "safety_reviewer",
        "finance",
        "admin",
      ],
      booking_state: [
        "DRAFT",
        "QUOTED",
        "SEARCHING",
        "MATCH_PROPOSED",
        "MATCH_CONFIRMED",
        "DRIVER_EN_ROUTE",
        "DRIVER_ARRIVED",
        "PASSENGER_ONBOARD",
        "IN_PROGRESS",
        "COMPLETED",
        "CANCELLED",
        "EXPIRED",
        "SUPPORT_REVIEW",
      ],
      ride_mode: [
        "PRIVATE",
        "SHARE_AND_SAVE",
        "SHARED_NOW",
        "BUDGET",
        "GROUP_PRIVATE",
      ],
      trip_state: [
        "planned",
        "driver_en_route",
        "in_progress",
        "completed",
        "cancelled",
      ],
    },
  },
} as const
