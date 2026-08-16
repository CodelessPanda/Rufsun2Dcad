import type { MapCaptureSettings } from "../types/cad";

const GOOGLE_MAPS_SCRIPT_ID = "google-maps-js";
const STATIC_MAP_MAX_SIZE = 640;

type GoogleMapsNamespace = {
  maps: {
    Map: new (
      element: HTMLElement,
      options: {
        center: { lat: number; lng: number };
        zoom: number;
        mapTypeId?: string;
        streetViewControl?: boolean;
        fullscreenControl?: boolean;
      }
    ) => {
      addListener: (eventName: "click", handler: (event: { latLng?: GoogleLatLng }) => void) => void;
      setCenter: (position: { lat: number; lng: number }) => void;
      setZoom: (zoom: number) => void;
    };
    Marker: new (
      options: {
        position: { lat: number; lng: number };
        map: unknown;
        draggable?: boolean;
      }
    ) => {
      addListener: (eventName: "dragend", handler: (event: { latLng?: GoogleLatLng }) => void) => void;
      setPosition: (position: { lat: number; lng: number }) => void;
    };
    Geocoder: new () => {
      geocode: (
        request: { location: { lat: number; lng: number } },
        callback: (results: Array<{ formatted_address: string }>, status: string) => void
      ) => void;
    };
    places: {
      Autocomplete: new (
        input: HTMLInputElement,
        options: { fields: string[]; types?: string[] }
      ) => {
        addListener: (eventName: "place_changed", handler: () => void) => void;
        getPlace: () => GooglePlace;
      };
    };
    event: {
      clearInstanceListeners: (instance: unknown) => void;
    };
  };
};

export type GoogleAutocomplete = InstanceType<GoogleMapsNamespace["maps"]["places"]["Autocomplete"]>;
export type GoogleMap = InstanceType<GoogleMapsNamespace["maps"]["Map"]>;
export type GoogleMarker = InstanceType<GoogleMapsNamespace["maps"]["Marker"]>;

export interface GoogleLatLng {
  lat: () => number;
  lng: () => number;
}

export interface GooglePlace {
  formatted_address?: string;
  place_id?: string;
  geometry?: {
    location?: {
      lat: () => number;
      lng: () => number;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleMapsNamespace;
  }
}

let googleMapsPromise: Promise<GoogleMapsNamespace> | null = null;

export function loadGoogleMaps(apiKey: string) {
  if (window.google?.maps?.places) return Promise.resolve(window.google);
  if (googleMapsPromise) return googleMapsPromise;

  googleMapsPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById(GOOGLE_MAPS_SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => window.google ? resolve(window.google) : reject(new Error("Google Maps failed to load")));
      existing.addEventListener("error", () => reject(new Error("Google Maps failed to load")));
      return;
    }

    const script = document.createElement("script");
    script.id = GOOGLE_MAPS_SCRIPT_ID;
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places`;
    script.onload = () => window.google ? resolve(window.google) : reject(new Error("Google Maps failed to load"));
    script.onerror = () => reject(new Error("Google Maps failed to load"));
    document.head.appendChild(script);
  });

  return googleMapsPromise;
}

export function normalizeMapCapture(params: {
  latitude: number;
  longitude: number;
  targetWidthM: number;
  targetHeightM: number;
  mapType?: "satellite" | "roadmap" | "hybrid";
}): MapCaptureSettings {
  const targetWidthM = Math.max(10, params.targetWidthM);
  const targetHeightM = Math.max(10, params.targetHeightM);
  const aspect = targetWidthM / targetHeightM;
  const imageWidthPx = aspect >= 1 ? STATIC_MAP_MAX_SIZE : Math.max(180, Math.round(STATIC_MAP_MAX_SIZE * aspect));
  const imageHeightPx = aspect >= 1 ? Math.max(180, Math.round(STATIC_MAP_MAX_SIZE / aspect)) : STATIC_MAP_MAX_SIZE;
  const zoom = zoomForMeters(params.latitude, targetWidthM, imageWidthPx);
  const metersPerPixel = metersPerPixelAtLatitude(params.latitude, zoom);

  return {
    latitude: params.latitude,
    longitude: params.longitude,
    zoom,
    widthM: round(metersPerPixel * imageWidthPx),
    heightM: round(metersPerPixel * imageHeightPx),
    imageWidthPx,
    imageHeightPx,
    mapType: params.mapType ?? "satellite"
  };
}

export function googleStaticMapUrl(map: MapCaptureSettings, apiKey: string) {
  const params = new URLSearchParams({
    center: `${map.latitude},${map.longitude}`,
    zoom: String(map.zoom),
    size: `${map.imageWidthPx}x${map.imageHeightPx}`,
    scale: "2",
    maptype: map.mapType,
    key: apiKey
  });
  return `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`;
}

export function metersPerPixelAtLatitude(latitude: number, zoom: number) {
  return (Math.cos((latitude * Math.PI) / 180) * 156543.03392) / 2 ** zoom;
}

export function placeFromLatLng(latitude: number, longitude: number, formattedAddress?: string): GooglePlace {
  return {
    formatted_address: formattedAddress,
    geometry: {
      location: {
        lat: () => latitude,
        lng: () => longitude
      }
    }
  };
}

export async function reverseGeocode(apiKey: string, latitude: number, longitude: number): Promise<GooglePlace> {
  const google = await loadGoogleMaps(apiKey);
  const geocoder = new google.maps.Geocoder();
  return new Promise((resolve) => {
    geocoder.geocode({ location: { lat: latitude, lng: longitude } }, (results, status) => {
      const address = status === "OK" ? results[0]?.formatted_address : undefined;
      resolve(placeFromLatLng(latitude, longitude, address));
    });
  });
}

function zoomForMeters(latitude: number, widthM: number, widthPx: number) {
  const raw = Math.log2((Math.cos((latitude * Math.PI) / 180) * 156543.03392 * widthPx) / widthM);
  return Math.max(0, Math.min(21, Math.round(raw)));
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
