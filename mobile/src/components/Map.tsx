import { GoogleMap, useJsApiLoader, Marker } from '@react-google-maps/api';

const containerStyle = {
  width: '100%',
  height: '100%',
};

interface MapProps {
  center: { lat: number; lng: number };
  markers?: Array<{ lat: number; lng: number; id: string }>;
}

const Map = ({ center, markers = [] }: MapProps) => {
  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
  });

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-full w-full bg-gray-200">
        <p className="text-gray-600 text-lg">Loading Map...</p>
      </div>
    );
  }

  return (
    <GoogleMap
      mapContainerStyle={containerStyle}
      center={center}
      zoom={15}
      options={{
        disableDefaultUI: true,
        zoomControl: false,
      }}
    >
      <Marker 
        position={center} 
        icon={{
          url: 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png'
        }}
      />
      
      {markers.map((marker) => (
        <Marker key={marker.id} position={{ lat: marker.lat, lng: marker.lng }} />
      ))}
    </GoogleMap>
  );
};

export default Map;