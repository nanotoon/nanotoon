// Import all actions from one place:
//   import { toggleLike, postComment, signOut } from "@/lib/actions";

export { signUpWithEmail, signInWithEmail, signInWithOAuth, signOut } from "./auth";
export { getSeries, getSeriesBySlug, createSeries, updateSeries, deleteSeries, getSeriesByAuthor } from "./series";
export { getChapters, getChapter, createChapter, deleteChapter } from "./chapters";
export { getComments, postComment, deleteComment, toggleCommentLike, getUserCommentLikes } from "./comments";
export { toggleLike, checkLiked, toggleFavorite, checkFavorited, getFavorites } from "./likes";
export { toggleFollow, checkFollowing, getFollowers, getFollowing, getFollowCounts } from "./follows";
export { getNotifications, getUnreadCount, markNotificationRead, markAllNotificationsRead } from "./notifications";
export { getMyProfile, getProfileByHandle, updateProfile, uploadAvatar } from "./profile";
export { submitReport } from "./reports";
export { uploadThumbnail, uploadChapterPages } from "./uploads";
