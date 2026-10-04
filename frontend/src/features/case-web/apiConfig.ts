export const RENDER_API_URL = "https://crimepath.onrender.com/api";
export const LOCAL_API_URL = "http://localhost:4000/api";

export const API_BASE_URL = import.meta.env.VITE_API_URL || RENDER_API_URL;
export const API_FALLBACK_URL = API_BASE_URL === LOCAL_API_URL ? RENDER_API_URL : LOCAL_API_URL;
