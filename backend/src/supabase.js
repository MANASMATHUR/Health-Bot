const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;
if (!url || !key) {
  throw new Error(
    'Missing SUPABASE_URL or SUPABASE_SERVICE_KEY. Copy backend/.env.example to backend/.env and add your Supabase project credentials.'
  );
}

const supabase = createClient(url, key);

module.exports = supabase;
