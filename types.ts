
export interface MapLocation {
  lat: number;
  lng: number;
  zoom: number;
}

export interface AnalysisResult {
  text: string;
  loading: boolean;
  error?: string;
}

export enum MapLayerType {
  SATELLITE = 'Esri World Imagery',
  STREETS = 'OpenStreetMap',
}

export interface User {
  id: string;
  nickname: string;
  email: string;
  avatar?: string;
}

export interface CustomLayer {
  id: string;
  userId: string; // Linked to User.id for data isolation
  name: string;
  sourceFileName?: string; // Original filename for export naming
  cloudObjectKey?: string; // COS 存储路径
  cloudFileName?: string;  // 云端注册的文件名
  type: 'grid' | 'reference';
  data: any; // GeoJSON FeatureCollection
  timestamp: number;
  visible?: boolean;
  idKeyName?: string; // 识别到的原始 ID 字段名称
}
