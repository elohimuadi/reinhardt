'use client'
import { createClient } from '@supabase/supabase-js'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY!
)

export default function AdminPage() {
  return <button onClick={() => admin.from('notes').delete().neq('id', 0)}>Reset</button>
}
