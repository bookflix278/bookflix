import { createClient } from '@supabase/supabase-js';

function getClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function normalizeSupabaseBook(row) {
  return {
    _id: `sb_${row.id}`,
    source: 'supabase',
    supabaseId: row.id,
    title: row.title || 'Sem título',
    author: row.author || 'Unknown',
    category: row.category || 'Geral',
    description: row.description || '',
    downloads: row.downloads || 0,
    status: 'active',
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.created_at || new Date().toISOString(),
    cover: row.cover_url ? { externalUrl: row.cover_url } : null,
    file: row.file_url
      ? {
          externalUrl: row.file_url,
          mime: row.file_type || 'application/pdf',
          size: 0,
          filename: ''
        }
      : null,
    uploadedBy: { name: 'Supabase import' }
  };
}

export async function listSupabaseBooks({ search = '', category = '', sort = 'recent', limit = 200, page = 1 }) {
  const supabase = getClient();
  if (!supabase) return { books: [], total: 0, totalPages: 0, page };

  let query = supabase.from('books').select('*', { count: 'exact' });

  if (search) {
    query = query.or(`title.ilike.%${search}%,author.ilike.%${search}%,category.ilike.%${search}%`);
  }
  if (category) {
    query = query.eq('category', category);
  }

  if (sort === 'downloads') query = query.order('downloads', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false });
  else if (sort === 'az') query = query.order('title', { ascending: true });
  else query = query.order('created_at', { ascending: false });

  const from = (page - 1) * limit;
  const to = from + limit - 1;
  query = query.range(from, to);

  const { data, count, error } = await query;
  if (error) throw error;

  const books = (data || []).map(normalizeSupabaseBook);
  const total = count || books.length;
  return { books, total, totalPages: Math.ceil(total / limit), page };
}

export async function getSupabaseBookById(id) {
  const supabase = getClient();
  if (!supabase) return null;
  const cleanId = id.startsWith('sb_') ? id.slice(3) : id;
  const { data, error } = await supabase.from('books').select('*').eq('id', cleanId).maybeSingle();
  if (error) throw error;
  return data ? normalizeSupabaseBook(data) : null;
}

export async function getSupabaseTopBooks(limit = 20) {
  const supabase = getClient();
  if (!supabase) return [];
  const { data, error } = await supabase.from('books').select('*').order('downloads', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return (data || []).map(normalizeSupabaseBook);
}

export async function getSupabaseRecommended(limit = 20) {
  const supabase = getClient();
  if (!supabase) return [];
  const { data, error } = await supabase.from('books').select('*').order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return (data || []).map(normalizeSupabaseBook);
}
