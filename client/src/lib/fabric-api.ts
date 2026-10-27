// API configuration for connecting to fabric-api
export const API_CONFIG = {
  BASE_URL: process.env.NEXT_PUBLIC_FABRIC_API_URL || 'http://localhost:3001',
  SATELLITE_URL: process.env.NEXT_PUBLIC_SATELLITE_API_URL || 'http://localhost:8000',
  ENDPOINTS: {
    AUTH: {
      LOGIN: '/api/auth/login',
      LOGOUT: '/api/auth/logout',
      ME: '/api/auth/me',
      REGISTER: '/api/auth/register'
    },
    LAND: {
      APPLICATIONS: '/api/land/applications',
      CREATE: '/api/land/applications',
      GET_BY_ID: (id: string) => `/api/land/applications/${id}`,
      GET_BY_EMAIL: (email: string) => `/api/land/applications/email/${email}`,
      VERIFY: (id: string) => `/api/land/applications/${id}/verify`,
      SURVEY: (id: string) => `/api/land/applications/${id}/survey`,
      FORWARD: (id: string) => `/api/land/applications/${id}/forward`,
      APPROVE: (id: string) => `/api/land/applications/${id}/approve`,
      HISTORY: (id: string) => `/api/land/applications/${id}/history`
    },
    GIS: {
      STORE_BOUNDARY: '/api/gis/store-boundary',
      CHECK_OVERLAP: '/api/gis/check-overlap',
      PARCEL: (id: string) => `/api/gis/parcel/${id}`,
      PARCELS_IN_AREA: '/api/gis/parcels-in-area',
      UPDATE_LANDUSE: (id: string) => `/api/gis/update-landuse/${id}`,
      BOUNDARY_HISTORY: (id: string) => `/api/gis/boundary-history/${id}`,
    }
  },
  SATELLITE: {
    VERIFY: '/api/satellite/verify-land-use',
    COMPARE: '/api/satellite/compare',
    NDVI: (lat: number, lng: number) => `/api/satellite/ndvi/${lat}/${lng}`,
  }
};

// Helper function to make API calls to fabric-api
export async function apiCall(endpoint: string, options: RequestInit = {}, req?: any) {
  const url = `${API_CONFIG.BASE_URL}${endpoint}`;

  const config: RequestInit = {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  };

  // Add auth token from cookies (server-side) or localStorage (client-side)
  let token: string | undefined;
  if (req) {
    // Server-side: get from cookies
    token = req.cookies.get('fabric_token')?.value;
  } else {
    // Client-side: get from localStorage
    token = localStorage.getItem('fabric_token') || undefined;
  }

  if (token) {
    config.headers = {
      ...config.headers,
      'Authorization': `Bearer ${token}`,
    };
  }

  try {
    const response = await fetch(url, config);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Network error' }));
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('API call failed:', error);
    throw error;
  }
}

// Authentication helpers
export const auth = {
  login: async (username: string, password: string) => {
    const response = await apiCall(API_CONFIG.ENDPOINTS.AUTH.LOGIN, {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });

    if (response.success && response.token) {
      localStorage.setItem('fabric_token', response.token);
      localStorage.setItem('fabric_user', JSON.stringify(response.user));
    }

    return response;
  },

  logout: () => {
    localStorage.removeItem('fabric_token');
    localStorage.removeItem('fabric_user');
  },

  getCurrentUser: () => {
    const userStr = localStorage.getItem('fabric_user');
    return userStr ? JSON.parse(userStr) : null;
  },

  getToken: () => localStorage.getItem('fabric_token'),

  isAuthenticated: () => !!localStorage.getItem('fabric_token'),
};

// GIS API helpers
export const gisApi = {
  /** Fetch all parcels within a bounding box */
  getParcelsInArea: async (minX: number, minY: number, maxX: number, maxY: number) => {
    // gisController expects minLon/minLat/maxLon/maxLat
    const params = new URLSearchParams({ minLon: String(minX), minLat: String(minY), maxLon: String(maxX), maxLat: String(maxY) });
    return apiCall(`${API_CONFIG.ENDPOINTS.GIS.PARCELS_IN_AREA}?${params}`);
  },

  /** Get a single parcel by ID */
  getParcel: async (parcelId: string) =>
    apiCall(API_CONFIG.ENDPOINTS.GIS.PARCEL(parcelId)),

  /** Store a new parcel boundary */
  storeBoundary: async (parcelId: string, boundaryHash: string, bbox: object, areaSqm: number) =>
    apiCall(API_CONFIG.ENDPOINTS.GIS.STORE_BOUNDARY, {
      method: 'POST',
      body: JSON.stringify({ parcelId, boundaryHash, bbox, areaSqm: String(areaSqm) }),
    }),

  /** Check if a GeoJSON polygon overlaps any existing parcel */
  checkOverlap: async (parcelId: string, geometry: object) =>
    apiCall(API_CONFIG.ENDPOINTS.GIS.CHECK_OVERLAP, {
      method: 'POST',
      body: JSON.stringify({ parcelId, geometry }),
    }),

  /** Get boundary history from chaincode */
  getBoundaryHistory: async (parcelId: string) =>
    apiCall(API_CONFIG.ENDPOINTS.GIS.BOUNDARY_HISTORY(parcelId)),

  /** Fetch NDVI data from satellite service */
  getNdvi: async (lat: number, lng: number) => {
    const url = `${API_CONFIG.SATELLITE_URL}${API_CONFIG.SATELLITE.NDVI(lat, lng)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Satellite API error: ${res.status}`);
    return res.json();
  },
};