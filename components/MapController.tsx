import React, { useEffect } from 'react';
import { useMap, useMapEvents } from 'react-leaflet';
import { MapLocation } from '../types';

interface MapControllerProps {
  onMoveEnd: (loc: MapLocation) => void;
  targetLocation?: MapLocation | null;
}

export const MapController: React.FC<MapControllerProps> = ({ onMoveEnd, targetLocation }) => {
  const map = useMap();

  useMapEvents({
    moveend: () => {
      const center = map.getCenter();
      onMoveEnd({
        lat: center.lat,
        lng: center.lng,
        zoom: map.getZoom(),
      });
    },
  });

  useEffect(() => {
    if (targetLocation) {
      map.flyTo([targetLocation.lat, targetLocation.lng], targetLocation.zoom, {
        duration: 1.5,
      });
    }
  }, [targetLocation, map]);

  return null;
};
