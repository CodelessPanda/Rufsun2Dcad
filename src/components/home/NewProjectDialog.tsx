import { useEffect, useMemo, useRef, useState } from "react";
import type { CreateCustomerInput, Customer } from "../../api/types";
import type { MapCaptureSettings } from "../../types/cad";
import {
  googleStaticMapUrl,
  loadGoogleMaps,
  normalizeMapCapture,
  reverseGeocode,
  setCadMapMode,
  type GoogleAutocomplete,
  type GoogleMap,
  type GoogleMarker,
  type GooglePlace
} from "../../services/googleMaps";

interface Props {
  open: boolean;
  busy: boolean;
  googleMapsApiKey: string;
  customers: Customer[];
  preselectedCustomerId?: string | null;
  onCancel: () => void;
  onCreateCustomer: (input: CreateCustomerInput) => Promise<Customer>;
  onCreate: (input: {
    customer: Customer;
    projectName: string;
    installationAddress: string;
    mapCapture?: MapCaptureSettings;
    placeId?: string;
    latitude?: number;
    longitude?: number;
  }) => Promise<void>;
}

export function NewProjectDialog({
  open,
  busy,
  googleMapsApiKey,
  customers,
  preselectedCustomerId,
  onCancel,
  onCreateCustomer,
  onCreate
}: Props) {
  const addressInputRef = useRef<HTMLInputElement | null>(null);
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<GoogleMap | null>(null);
  const markerRef = useRef<GoogleMarker | null>(null);
  const [customerId, setCustomerId] = useState(preselectedCustomerId ?? "");
  const [quickCustomerOpen, setQuickCustomerOpen] = useState(false);
  const [quickCustomer, setQuickCustomer] = useState({ name: "", phone: "", email: "" });
  const [projectName, setProjectName] = useState("");
  const [address, setAddress] = useState("");
  const [place, setPlace] = useState<GooglePlace | null>(null);
  const [mapWidthM, setMapWidthM] = useState(85);
  const [mapHeightM, setMapHeightM] = useState(85);
  const [mapError, setMapError] = useState("");
  const selectedCustomer = customers.find((customer) => customer.id === customerId) ?? null;

  useEffect(() => {
    if (open) setCustomerId(preselectedCustomerId ?? "");
  }, [open, preselectedCustomerId]);

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
          fullscreenControl: false,
          rotateControl: false,
          tilt: 0,
          heading: 0
        });
      mapInstanceRef.current = map;
      map.setCenter(position);
      map.setZoom(mapCapture?.zoom ?? 20);
      setCadMapMode(map);

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
    if (!selectedCustomer || !projectName.trim()) return;
    if (googleMapsApiKey && !mapCapture) {
      setMapError("Select a complete validated address before creating the project.");
      return;
    }
    const location = place?.geometry?.location;
    await onCreate({
      customer: selectedCustomer,
      projectName: projectName.trim(),
      installationAddress: (place?.formatted_address ?? address).trim(),
      mapCapture,
      placeId: place?.place_id,
      latitude: location?.lat(),
      longitude: location?.lng()
    });
    setProjectName("");
    setAddress("");
    setPlace(null);
    mapInstanceRef.current = null;
    markerRef.current = null;
  };

  const createQuickCustomer = async () => {
    if (!quickCustomer.name.trim()) return;
    const customer = await onCreateCustomer({
      name: quickCustomer.name.trim(),
      phone: quickCustomer.phone.trim(),
      email: quickCustomer.email.trim()
    });
    setCustomerId(customer.id);
    setQuickCustomer({ name: "", phone: "", email: "" });
    setQuickCustomerOpen(false);
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
          <span>Customer</span>
          <select autoFocus value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
            <option value="">Search existing customer</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="secondary-action compact-action" onClick={() => setQuickCustomerOpen((open) => !open)}>
          + Create Customer
        </button>
        {quickCustomerOpen && (
          <div className="quick-create-box">
            <label className="field stacked">
              <span>Name *</span>
              <input value={quickCustomer.name} onChange={(event) => setQuickCustomer((current) => ({ ...current, name: event.target.value }))} />
            </label>
            <div className="form-grid-two">
              <label className="field stacked">
                <span>Phone</span>
                <input value={quickCustomer.phone} onChange={(event) => setQuickCustomer((current) => ({ ...current, phone: event.target.value }))} />
              </label>
              <label className="field stacked">
                <span>Email</span>
                <input type="email" value={quickCustomer.email} onChange={(event) => setQuickCustomer((current) => ({ ...current, email: event.target.value }))} />
              </label>
            </div>
            <button type="button" className="primary-action compact-action" disabled={busy || !quickCustomer.name.trim()} onClick={() => void createQuickCustomer()}>
              Create Customer
            </button>
          </div>
        )}
        <label className="field stacked">
          <span>Project name</span>
          <input value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="Rohini Residence" />
        </label>
        <label className="field stacked">
          <span>Installation address</span>
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
          <button type="submit" disabled={busy || !selectedCustomer || !projectName.trim()}>
            Create
          </button>
        </div>
      </form>
    </div>
  );
}
