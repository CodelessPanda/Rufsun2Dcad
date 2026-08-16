import { useEffect, useMemo, useRef, useState } from "react";
import type { MapCaptureSettings } from "../../types/cad";
import {
  googleStaticMapUrl,
  loadGoogleMaps,
  normalizeMapCapture,
  reverseGeocode,
  type GoogleAutocomplete,
  type GoogleMap,
  type GoogleMarker,
  type GooglePlace
} from "../../services/googleMaps";

interface Props {
  open: boolean;
  busy: boolean;
  googleMapsApiKey: string;
  onCancel: () => void;
  onCreate: (customerName: string, address: string, mapCapture?: MapCaptureSettings) => Promise<void>;
}

export function NewProjectDialog({ open, busy, googleMapsApiKey, onCancel, onCreate }: Props) {
  const addressInputRef = useRef<HTMLInputElement | null>(null);
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<GoogleMap | null>(null);
  const markerRef = useRef<GoogleMarker | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [address, setAddress] = useState("");
  const [place, setPlace] = useState<GooglePlace | null>(null);
  const [mapWidthM, setMapWidthM] = useState(85);
  const [mapHeightM, setMapHeightM] = useState(85);
  const [mapError, setMapError] = useState("");

  const mapCapture = useMemo(() => {
    const location = place?.geometry?.location;
    if (!location) return undefined;
    return normalizeMapCapture({
      latitude: location.lat(),
      longitude: location.lng(),
      targetWidthM: mapWidthM,
      targetHeightM: mapHeightM,
      mapType: "satellite"
    });
  }, [mapHeightM, mapWidthM, place]);

  useEffect(() => {
    if (!open || !googleMapsApiKey || !addressInputRef.current) return;
    let autocomplete: GoogleAutocomplete | null = null;
    let cancelled = false;

    void loadGoogleMaps(googleMapsApiKey)
      .then((google) => {
        if (cancelled || !addressInputRef.current) return;
        autocomplete = new google.maps.places.Autocomplete(addressInputRef.current, {
          fields: ["formatted_address", "geometry", "place_id"],
          types: ["address"]
        });
        autocomplete.addListener("place_changed", () => {
          const nextPlace = autocomplete?.getPlace();
          if (!nextPlace?.formatted_address || !nextPlace.geometry?.location) {
            setPlace(null);
            setMapError("Select a complete address from the autocomplete list.");
            return;
          }
          setPlace(nextPlace);
          setAddress(nextPlace.formatted_address);
          setMapError("");
        });
      })
      .catch(() => setMapError("Google Maps could not load. Check the API key in Settings."));

    return () => {
      cancelled = true;
      if (autocomplete && window.google?.maps.event) window.google.maps.event.clearInstanceListeners(autocomplete);
    };
  }, [googleMapsApiKey, open]);

  useEffect(() => {
    const location = place?.geometry?.location;
    if (!open || !googleMapsApiKey || !mapRef.current || !location) return;
    let cancelled = false;
    const position = { lat: location.lat(), lng: location.lng() };

    const updateLocation = (lat: number, lng: number) => {
      setMapError("");
      void reverseGeocode(googleMapsApiKey, lat, lng).then((nextPlace) => {
        if (cancelled) return;
        setPlace(nextPlace);
        if (nextPlace.formatted_address) setAddress(nextPlace.formatted_address);
        else setMapError("Location selected. Enable Geocoding API to convert it into a complete address.");
      });
    };

    void loadGoogleMaps(googleMapsApiKey).then((google) => {
      if (cancelled || !mapRef.current) return;
      const isNewMap = !mapInstanceRef.current;
      const map =
        mapInstanceRef.current ??
        new google.maps.Map(mapRef.current, {
          center: position,
          zoom: mapCapture?.zoom ?? 20,
          mapTypeId: "satellite",
          streetViewControl: false,
          fullscreenControl: false
        });
      mapInstanceRef.current = map;
      map.setCenter(position);
      map.setZoom(mapCapture?.zoom ?? 20);

      const isNewMarker = !markerRef.current;
      const marker =
        markerRef.current ??
        new google.maps.Marker({
          position,
          map,
          draggable: true
        });
      markerRef.current = marker;
      marker.setPosition(position);
      if (isNewMarker) {
        marker.addListener("dragend", (event) => {
          if (event.latLng) updateLocation(event.latLng.lat(), event.latLng.lng());
        });
      }
      if (isNewMap) {
        map.addListener("click", (event) => {
          if (event.latLng) {
            marker.setPosition({ lat: event.latLng.lat(), lng: event.latLng.lng() });
            updateLocation(event.latLng.lat(), event.latLng.lng());
          }
        });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [googleMapsApiKey, mapCapture?.zoom, open, place]);

  if (!open) return null;

  const submit = async () => {
    const trimmedName = customerName.trim();
    if (!trimmedName) return;
    if (googleMapsApiKey && !mapCapture) {
      setMapError("Select a complete validated address before creating the project.");
      return;
    }
    await onCreate(trimmedName, (place?.formatted_address ?? address).trim(), mapCapture);
    setCustomerName("");
    setAddress("");
    setPlace(null);
    mapInstanceRef.current = null;
    markerRef.current = null;
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={() => !busy && onCancel()}>
      <form
        className="new-project-dialog"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <h2>New Project</h2>
        <label className="field stacked">
          <span>Name of customer</span>
          <input
            autoFocus
            value={customerName}
            onChange={(event) => setCustomerName(event.target.value)}
            placeholder="Customer name"
          />
        </label>
        <label className="field stacked">
          <span>Address</span>
          <input
            ref={addressInputRef}
            value={address}
            onChange={(event) => {
              setAddress(event.target.value);
              setPlace(null);
            }}
            placeholder={googleMapsApiKey ? "Start typing and select a complete address" : "Add Google Maps API key in Settings for autocomplete"}
          />
        </label>
        {mapError && <p className="warning">{mapError}</p>}
        {mapCapture && (
          <div className="map-capture-box">
            <img src={googleStaticMapUrl(mapCapture, googleMapsApiKey)} alt="Selected map capture" />
            <div className="map-capture-grid">
              <label>
                <span>Map width</span>
                <input type="number" min={20} step={5} value={mapWidthM} onChange={(event) => setMapWidthM(Number(event.target.value))} />
                <em>m</em>
              </label>
              <label>
                <span>Map height</span>
                <input type="number" min={20} step={5} value={mapHeightM} onChange={(event) => setMapHeightM(Number(event.target.value))} />
                <em>m</em>
              </label>
            </div>
            <div className="interactive-map" ref={mapRef} />
            <p className="fine-print">
              Drag the marker or click the map to adjust the location. Captured at {mapCapture.widthM.toFixed(1)} m × {mapCapture.heightM.toFixed(1)} m.
            </p>
          </div>
        )}
        <div className="dialog-actions">
          <button type="button" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="submit" disabled={busy || !customerName.trim()}>
            Create
          </button>
        </div>
      </form>
    </div>
  );
}
