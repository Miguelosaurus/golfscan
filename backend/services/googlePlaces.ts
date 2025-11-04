const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_API_KEY;

export interface GooglePlacesImageOptions {
  courseName: string;
  locationText?: string;
  latitude?: number;
  longitude?: number;
}

export interface GooglePlacesImageResult {
  imageDataUrl: string;
  placeId?: string;
}

interface PlacePhoto {
  name: string;
  authorAttributions?: Array<{ displayName?: string }>;
}

interface TextSearchPlace {
  id: string;
  displayName?: { text: string };
  photos?: PlacePhoto[];
}

interface TextSearchResponse {
  places?: TextSearchPlace[];
  error?: { code: number; message: string; status?: string };
}

interface NearbySearchResponse {
  places?: TextSearchPlace[];
  error?: { code: number; message: string; status?: string };
}

interface PlaceDetailsResponse {
  primaryPhoto?: PlacePhoto;
  photos?: PlacePhoto[];
  error?: { code: number; message: string; status?: string };
}

interface PlaceCandidate {
  placeId: string;
  name: string;
  photoName?: string;
}

const PLACES_TEXT_SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText';
const PLACES_NEARBY_SEARCH_URL = 'https://places.googleapis.com/v1/places:searchNearby';

const headers = {
  'Content-Type': 'application/json',
  'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY!,
  'X-Goog-FieldMask': 'places.id,places.displayName,places.photos',
};

const callPlacesTextSearch = async (body: Record<string, unknown>): Promise<TextSearchResponse> => {
  console.log('[GooglePlaces] textsearch request', body);
  const response = await fetch(PLACES_TEXT_SEARCH_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const data = (await response.json()) as TextSearchResponse;
  console.log('[GooglePlaces] textsearch response', data?.error ? { error: data.error } : { places: data.places?.length ?? 0 });
  return data;
};

const callPlacesNearbySearch = async (body: Record<string, unknown>): Promise<NearbySearchResponse> => {
  console.log('[GooglePlaces] nearbysearch request', body);
  const response = await fetch(PLACES_NEARBY_SEARCH_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const data = (await response.json()) as NearbySearchResponse;
  console.log('[GooglePlaces] nearbysearch response', data?.error ? { error: data.error } : { places: data.places?.length ?? 0 });
  return data;
};

const selectCandidateWithPhotos = (places?: TextSearchResponse['places']): PlaceCandidate | null => {
  if (!Array.isArray(places) || places.length === 0) return null;
  const candidate = places.find((place) => Array.isArray(place.photos) && place.photos.length > 0)
    ?? places[0];

  if (!candidate) return null;

  return {
    placeId: candidate.id,
    name: candidate.displayName?.text ?? candidate.id,
    photoName: candidate.photos?.[0]?.name,
  };
};

const buildLocationBias = (latitude?: number, longitude?: number, radiusMeters = 50000) => {
  if (latitude === undefined || longitude === undefined) {
    return undefined;
  }
  return {
    circle: {
      center: { latitude, longitude },
      radius: radiusMeters,
    },
  };
};

const buildLocationRestriction = (latitude?: number, longitude?: number, radiusMeters = 20000) => {
  if (latitude === undefined || longitude === undefined) {
    return undefined;
  }
  return {
    circle: {
      center: { latitude, longitude },
      radius: radiusMeters,
    },
  };
};

const getPlaceCandidate = async (options: GooglePlacesImageOptions): Promise<PlaceCandidate | null> => {
  const textQueries = new Set<string>();
  const coreName = options.courseName.trim();
  textQueries.add(`${coreName} golf course`);
  if (options.locationText) {
    textQueries.add(`${coreName} ${options.locationText}`);
    textQueries.add(`${coreName.split('-')[0]?.trim() ?? coreName} ${options.locationText}`);
  }
  const simplifiedName = coreName.split('-')[0]?.trim();
  if (simplifiedName) {
    textQueries.add(`${simplifiedName} golf course`);
  }
  if (options.latitude && options.longitude) {
    textQueries.add(`golf course near ${options.latitude},${options.longitude}`);
    textQueries.add(`${simplifiedName ?? coreName} near ${options.latitude},${options.longitude}`);
  }

  for (const query of textQueries) {
    const textBody = {
      textQuery: query,
      languageCode: 'en',
      locationBias: buildLocationBias(options.latitude, options.longitude),
    };

    const textData = await callPlacesTextSearch(textBody);
    if (textData.error) {
      console.warn('[GooglePlaces] textsearch error', textData.error);
      continue;
    }

    const candidate = selectCandidateWithPhotos(textData.places);
    if (candidate?.photoName) {
      console.log('[GooglePlaces] using textsearch candidate', candidate);
      return candidate;
    }
  }

  if (options.latitude && options.longitude) {
    const nearbyBody = {
      locationRestriction: buildLocationRestriction(options.latitude, options.longitude),
      includedTypes: ['golf_course'],
      maxResultCount: 10,
      rankPreference: 'DISTANCE',
      languageCode: 'en',
    };

    const nearbyData = await callPlacesNearbySearch(nearbyBody);
    if (!nearbyData.error) {
      const candidate = selectCandidateWithPhotos(nearbyData.places);
      if (candidate?.photoName) {
        console.log('[GooglePlaces] using nearbysearch candidate', candidate);
        return candidate;
      }
    } else {
      console.warn('[GooglePlaces] nearbysearch error', nearbyData.error);
    }
  }

  return null;
};

const placeDetailsHeaders = {
  'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY!,
  'X-Goog-FieldMask': 'primaryPhoto,photos',
};

const fetchPlaceDetails = async (placeId: string): Promise<PlaceDetailsResponse | null> => {
  try {
    const url = new URL(`https://places.googleapis.com/v1/places/${placeId}`);
    url.searchParams.set('languageCode', 'en');
    console.log('[GooglePlaces] fetchPlace request', { placeId });
    const response = await fetch(url.toString(), {
      headers: placeDetailsHeaders,
    });
    const data = (await response.json()) as PlaceDetailsResponse;
    if (data?.error) {
      console.warn('[GooglePlaces] fetchPlace error', data.error);
      return null;
    }
    return data;
  } catch (error) {
    console.error('[GooglePlaces] fetchPlace exception', error);
    return null;
  }
};

const choosePreferredPhoto = (details?: PlaceDetailsResponse | null, fallbackName?: string): string | undefined => {
  const primary = details?.primaryPhoto?.name;
  if (primary) return primary;

  const businessPhoto = details?.photos?.find((photo) => {
    if (!photo.authorAttributions || photo.authorAttributions.length === 0) {
      return true;
    }
    return photo.authorAttributions.some((attr) =>
      attr.displayName?.toLowerCase().includes('google')
    );
  });
  if (businessPhoto?.name) return businessPhoto.name;

  const firstPhoto = details?.photos?.[0]?.name;
  if (firstPhoto) return firstPhoto;

  return fallbackName;
};

export async function fetchCourseImageFromGooglePlaces(
  options: GooglePlacesImageOptions
): Promise<GooglePlacesImageResult | null> {
  if (!GOOGLE_PLACES_API_KEY) {
    throw new Error('Google Places API key (GOOGLE_PLACES_API_KEY) is not configured.');
  }

  try {
    console.log('[GooglePlaces] fetch start', {
      courseName: options.courseName,
      locationText: options.locationText,
      latitude: options.latitude,
      longitude: options.longitude,
    });

    const candidate = await getPlaceCandidate(options);

    if (!candidate?.placeId) {
      console.warn('[GooglePlaces] no candidate with photos found');
      return null;
    }

    const details = await fetchPlaceDetails(candidate.placeId);
    const preferredPhotoName = choosePreferredPhoto(details, candidate.photoName);

    if (!preferredPhotoName) {
      console.warn('[GooglePlaces] candidate has no available photos', { placeId: candidate.placeId });
      return null;
    }

    console.log('[GooglePlaces] preferred photo', {
      placeId: candidate.placeId,
      preferredPhotoName,
      usedFallback: preferredPhotoName === candidate.photoName,
    });

    const photoUrl = new URL(`https://places.googleapis.com/v1/${preferredPhotoName}/media`);
    photoUrl.searchParams.set('key', GOOGLE_PLACES_API_KEY);
    photoUrl.searchParams.set('maxHeightPx', '1280');

    console.log('[GooglePlaces] photo URL', photoUrl.toString());
    const photoResponse = await fetch(photoUrl.toString(), {
      headers: { 'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY! },
    });
    if (!photoResponse.ok) {
      throw new Error(`Google Places photo fetch failed with status ${photoResponse.status}`);
    }

    const arrayBuffer = await photoResponse.arrayBuffer();
    const mimeType = photoResponse.headers.get('content-type') || 'image/jpeg';
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    console.log('[GooglePlaces] photo fetch success', {
      mimeType,
      bytes: arrayBuffer.byteLength,
      placeId: candidate.placeId,
    });

    return {
      imageDataUrl: `data:${mimeType};base64,${base64}`,
      placeId: candidate.placeId,
    };
  } catch (error) {
    console.error('Google Places image fetch error:', error);
    return null;
  }
}
