// Auto-generated types matching your Supabase tables
// These give you type safety when reading/writing data

export type Profile = {
  id: string;
  display_name: string;
  handle: string;
  avatar_url: string | null;
  bio: string | null;
  links: string | null;
  created_at: string | null;
};

export type Series = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  format: string;
  genres: string[] | null;
  thumbnail_url: string | null;
  author_id: string;
  total_views: number | null;
  total_likes: number | null;
  total_favorites: number | null;
  created_at: string | null;
  updated_at: string | null;
};

export type Chapter = {
  id: string;
  series_id: string;
  chapter_number: number;
  title: string;
  rating: string;
  page_urls: string[] | null;
  views: number | null;
  created_at: string | null;
};

export type Comment = {
  id: string;
  user_id: string;
  series_id: string | null;
  chapter_id: string | null;
  body: string;
  likes_count: number | null;
  created_at: string | null;
};

export type CommentLike = {
  user_id: string;
  comment_id: string;
};

export type Favorite = {
  user_id: string;
  series_id: string;
  created_at: string | null;
};

export type Follow = {
  follower_id: string;
  following_id: string;
  created_at: string | null;
};

export type Like = {
  user_id: string;
  series_id: string;
  created_at: string | null;
};

export type Notification = {
  id: string;
  user_id: string;
  actor_id: string | null;
  type: string;
  message: string;
  series_id: string | null;
  comment_id: string | null;
  read: boolean | null;
  created_at: string | null;
};

export type Report = {
  id: string;
  reporter_id: string;
  series_id: string | null;
  chapter_id: string | null;
  comment_id: string | null;
  reason: string;
  note: string | null;
  status: string | null;
  created_at: string | null;
};

// Joined types (for queries that join tables)
export type CommentWithProfile = Comment & {
  profiles: Pick<Profile, "display_name" | "handle" | "avatar_url">;
};

export type SeriesWithAuthor = Series & {
  profiles: Pick<Profile, "display_name" | "handle" | "avatar_url">;
};

export type NotificationWithActor = Notification & {
  actor: Pick<Profile, "display_name" | "handle" | "avatar_url"> | null;
};
