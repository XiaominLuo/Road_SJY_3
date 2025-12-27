import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, LayersControl, ScaleControl, GeoJSON } from 'react-leaflet';
import L from 'leaflet';
import shp from 'shpjs';
import COS from 'cos-js-sdk-v5';
import JSZip from 'jszip';
import { MapLocation, User, CustomLayer } from './types';
import { MapController } from './components/MapController';
import { LandingPage } from './components/LandingPage';
import { AuthModal } from './components/AuthModal';
import { OnboardingTour } from './components/OnboardingTour';
import { api } from './services/apiService';
import { Layers, LogOut, Save, CheckCircle2, Building2, AlertTriangle, Trash2, Table2, Minimize2, Loader2, ChevronDown, ChevronUp, Mail, Milestone } from 'lucide-react';
import { stringToArrayBuffer } from './util';

// Fix for default Leaflet marker icons
// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface ExtendedCustomLayer extends CustomLayer {
    originalFiles?: Record<string, Uint8Array>;
}

const DEFAULT_LOCATION: MapLocation = { lat: 34.5, lng: 96.0, zoom: 13 };
const STORAGE_KEY_USER = 'geo-scout-user-v2';

type LabelMode = 'road' | 'building';

const updateDbfBinary = (dbfBuffer: Uint8Array, features: any[], gridStates: Record<string, number>, buildingStates: Record<string, number>): Uint8Array => {
    const view = new DataView(dbfBuffer.buffer, dbfBuffer.byteOffset, dbfBuffer.byteLength);
    const numRecords = view.getUint32(4, true);
    const oldHeaderLen = view.getUint16(8, true);
    const oldRecordLen = view.getUint16(10, true);
    let fields: any[] = [];
    let roadFieldIdx = -1;
    let buildingFieldIdx = -1;
    let currentOffset = 1;
    for (let i = 32; i < oldHeaderLen - 1; i += 32) {
        let name = "";
        for (let j = 0; j < 11; j++) {
            const charCode = view.getUint8(i + j);
            if (charCode === 0) break;
            name += String.fromCharCode(charCode);
        }
        const cleanName = name.trim().toUpperCase();
        const width = view.getUint8(i + 16);
        fields.push({ name: cleanName, width, offset: currentOffset });
        if (cleanName === "ROAD") roadFieldIdx = fields.length - 1;
        if (cleanName === "BUILDING") buildingFieldIdx = fields.length - 1;
        currentOffset += width;
    }
    const fieldsToAdd = [];
    if (roadFieldIdx === -1) fieldsToAdd.push("ROAD");
    if (buildingFieldIdx === -1) fieldsToAdd.push("BUILDING");
    let finalBuffer = dbfBuffer;
    let finalHeaderLen = oldHeaderLen;
    let finalRecordLen = oldRecordLen;
    if (fieldsToAdd.length > 0) {
        const addedHeaderSize = fieldsToAdd.length * 32;
        const addedRecordSize = fieldsToAdd.length;
        finalHeaderLen = oldHeaderLen + addedHeaderSize;
        finalRecordLen = oldRecordLen + addedRecordSize;
        const newTotalSize = finalHeaderLen + (numRecords * finalRecordLen) + 1;
        const newBuf = new Uint8Array(newTotalSize);
        const newView = new DataView(newBuf.buffer);
        newBuf.set(dbfBuffer.slice(0, 32));
        newView.setUint16(8, finalHeaderLen, true);
        newView.setUint16(10, finalRecordLen, true);
        newBuf.set(dbfBuffer.slice(32, oldHeaderLen - 1), 32);
        let fieldDescPos = oldHeaderLen - 1;
        fieldsToAdd.forEach(name => {
            const fieldBuf = new Uint8Array(32);
            for (let k = 0; k < name.length; k++) fieldBuf[k] = name.charCodeAt(k);
            fieldBuf[11] = 67;
            fieldBuf[16] = 1;
            newBuf.set(fieldBuf, fieldDescPos);
            const newField = { name, width: 1, offset: currentOffset };
            if (name === "ROAD") roadFieldIdx = fields.length;
            if (name === "BUILDING") buildingFieldIdx = fields.length;
            fields.push(newField);
            currentOffset += 1;
            fieldDescPos += 32;
        });
        newBuf[finalHeaderLen - 1] = 0x0D;
        for (let r = 0; r < numRecords; r++) {
            const oldRecStart = oldHeaderLen + (r * oldRecordLen);
            const newRecStart = finalHeaderLen + (r * finalRecordLen);
            newBuf.set(dbfBuffer.slice(oldRecStart, oldRecStart + oldRecordLen), newRecStart);
            for (let f = 0; f < fieldsToAdd.length; f++) {
                newBuf[newRecStart + oldRecordLen + f] = 0x20;
            }
        }
        newBuf[newTotalSize - 1] = 0x1A;
        finalBuffer = newBuf;
    }
    const roadMeta = fields[roadFieldIdx];
    const buildMeta = fields[buildingFieldIdx];
    for (let i = 0; i < Math.min(numRecords, features.length); i++) {
        const feature = features[i];
        const recStart = finalHeaderLen + (i * finalRecordLen);
        const rState = gridStates[feature.id] || 0;
        const rChar = rState === 1 ? "1" : (rState === 2 ? "0" : " ");
        finalBuffer[recStart + roadMeta.offset] = rChar.charCodeAt(0);
        const bState = buildingStates[feature.id] || 0;
        const bChar = bState === 1 ? "1" : (bState === 2 ? "0" : " ");
        finalBuffer[recStart + buildMeta.offset] = bChar.charCodeAt(0);
    }
    return finalBuffer;
};

const generateGrid = (centerLat: number, centerLng: number, latSize: number = 0.001, count: number = 50) => {
    const features = [];
    const scaleFactor = Math.cos(centerLat * (Math.PI / 180));
    const lngSize = latSize / scaleFactor;
    const startLat = centerLat - (latSize * count) / 2;
    const startLng = centerLng - (lngSize * count) / 2;
    for (let i = 0; i < count; i++) {
        for (let j = 0; j < count; j++) {
            const lat = startLat + i * latSize;
            const lng = startLng + j * lngSize;
            const id = `${lat.toFixed(6)}_${lng.toFixed(6)}`;
            features.push({
                type: "Feature",
                id: id,
                properties: { id, FID: id },
                geometry: {
                    type: "Polygon",
                    coordinates: [[[lng, lat], [lng + lngSize, lat], [lng + lngSize, lat + latSize], [lng, lat + latSize], [lng, lat]]]
                }
            });
        }
    }
    return features;
};

const getFeatureStyle = (roadState: number, buildingState: number) => {
    let fillColor = '#3b82f6';
    let fillOpacity = 0.03;
    if (roadState === 1) {
        fillColor = '#ef4444';
        fillOpacity = 0.4;
    } else if (roadState === 2) {
        fillColor = '#22c55e';
        fillOpacity = 0.4;
    }
    let color = '#cbd5e1';
    let weight = 0.5;
    let dashArray = '2, 2';
    if (buildingState === 1) {
        color = '#facc15';
        weight = 2;
        dashArray = '';
    } else if (buildingState === 2) {
        color = '#3b82f6';
        weight = 2;
        dashArray = '';
    } else if (roadState !== 0) {
        color = fillColor;
        weight = 1;
        dashArray = '';
    }
    return { color, weight, opacity: 0.6, dashArray, fillColor, fillOpacity };
};

export default function App() {
    const [user, setUser] = useState<User | null>(() => {
        try {
            const savedUser = localStorage.getItem(STORAGE_KEY_USER);
            return savedUser ? JSON.parse(savedUser) : null;
        } catch (e) {
            return null;
        }
    });
    const [showAuthModal, setShowAuthModal] = useState(false);
    const [showTour, setShowTour] = useState(false);
    const [, setCurrentLocation] = useState<MapLocation>(DEFAULT_LOCATION);
    const [targetLocation, setTargetLocation] = useState<MapLocation | null>(null);
    const [isToolsOpen, setIsToolsOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [customLayers, setCustomLayers] = useState<ExtendedCustomLayer[]>([]);
    const [activeLayerId, setActiveLayerId] = useState<string | null>(null);
    const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(null);
    const [layerToDeleteId, setLayerToDeleteId] = useState<string | null>(null);
    const [gridDataVersion, setGridDataVersion] = useState(0);
    const [gridStates, setGridStates] = useState<Record<string, number>>({});
    const [buildingStates, setBuildingStates] = useState<Record<string, number>>({});
    const [labelMode, setLabelMode] = useState<LabelMode>('road');
    const fileInputRef = useRef<HTMLInputElement>(null);
    const geoJsonRef = useRef<L.GeoJSON>(null);
    const [isTableOpen, setIsTableOpen] = useState(true);
    const [isTaskProgressExpanded, setIsTaskProgressExpanded] = useState(true);

    const stateRef = useRef({ gridStates, buildingStates, labelMode, customLayers });
    useEffect(() => {
        stateRef.current = { gridStates, buildingStates, labelMode, customLayers };
    }, [gridStates, buildingStates, labelMode, customLayers]);

    const defaultGridFeatures = useMemo(() => generateGrid(34.5, 96.0), []);
    const activeGridFeatures = useMemo(() => {
        const userGridFeatures = customLayers
            .filter(layer => layer.type === 'grid' && layer.visible !== false)
            .flatMap(layer => {
                const raw = layer.data;
                if (raw.type === 'FeatureCollection' && Array.isArray(raw.features)) return raw.features;
                if (Array.isArray(raw)) return raw;
                return [raw];
            });
        return [...defaultGridFeatures, ...userGridFeatures];
    }, [defaultGridFeatures, customLayers]);

    const referenceLayers = useMemo(() => customLayers.filter(layer => layer.type === 'reference' && layer.visible !== false), [customLayers]);
    const activeLayer = useMemo(() => customLayers.find(l => l.id === activeLayerId), [customLayers, activeLayerId]);

    const stats = useMemo(() => {
        let targetIds: string[] = [];
        if (activeLayer && activeLayer.type === 'grid') {
            const data = activeLayer.data;
            const features = Array.isArray(data) ? data : (data.type === 'FeatureCollection' ? data.features : []);
            if (Array.isArray(features)) targetIds = features.map((f: any) => f.id).filter(Boolean);
        } else {
            targetIds = defaultGridFeatures.map(f => f.id);
        }
        let roadCount = 0;
        let noRoadCount = 0;
        let buildingCount = 0;
        let noBuildingCount = 0;
        targetIds.forEach(id => {
            const r = gridStates[id] || 0;
            const b = buildingStates[id] || 0;
            if (r === 1) roadCount++;
            if (r === 2) noRoadCount++;
            if (b === 1) buildingCount++;
            if (b === 2) noBuildingCount++;
        });
        return { roadCount, noRoadCount, buildingCount, noBuildingCount };
    }, [activeLayer, gridStates, buildingStates, defaultGridFeatures]);

    const taskProgress = useMemo(() => {
        const isCustomGrid = activeLayer && activeLayer.type === 'grid';
        const data = isCustomGrid ? activeLayer.data : { type: 'FeatureCollection', features: defaultGridFeatures };
        const features = Array.isArray(data) ? data : (data.type === 'FeatureCollection' ? data.features : []);
        const targetIds = Array.isArray(features) ? features.map((f: any) => f.id).filter(Boolean) : [];
        const total = targetIds.length;
        if (total === 0) return null;
        let markedRoad = 0;
        let markedBuilding = 0;
        targetIds.forEach(id => {
            if (gridStates[id] === 1 || gridStates[id] === 2) markedRoad++;
            if (buildingStates[id] === 1 || buildingStates[id] === 2) markedBuilding++;
        });
        return { fileName: isCustomGrid ? activeLayer.name.replace(' (可标注)', '') : '默认网格', total, markedRoad, markedBuilding };
    }, [activeLayer, gridStates, buildingStates, defaultGridFeatures]);

    const attributeTableData = useMemo(() => {
        if (!activeLayer || activeLayer.type !== 'grid') return null;
        const data = activeLayer.data;
        const features = Array.isArray(data) ? data : (data.type === 'FeatureCollection' ? data.features : []);
        if (features.length === 0) return null;
        const displayKey = activeLayer.idKeyName || 'ID';
        const rows = features.map((f: any) => ({
            id: f.id,
            displayId: f.id,
            geometry: f.geometry
        }));
        return { displayKey, rows };
    }, [activeLayer]);

    const syncAllToCloud = useCallback(async (silent = false) => {
        if (!user || stateRef.current.customLayers.length === 0) return;
        if (!silent) setIsSaving(true);
        setSaveStatus('idle');
        try {
            const layers = stateRef.current.customLayers.filter(l => l.userId === user.id);
            const filenames = layers.map(l => {
                const cleanName = l.name.replace(/ \(可标注\)/g, '').replace(/ \(参考层\)/g, '').replace(/\.[^/.]+$/, "");
                return `${cleanName}.zip`;
            });
            const uploadData = await api.getUploadCredentials(filenames);
            const { credentials, cos_info, files: uploadFiles } = uploadData;
            const cos = new COS({
                getAuthorization: (_: COS.GetAuthorizationOptions, callback: (params: COS.GetAuthorizationCallbackParams) => void) => {
                    callback({
                        TmpSecretId: credentials.secret_id,
                        TmpSecretKey: credentials.secret_key,
                        XCosSecurityToken: credentials.token,
                        SecurityToken: credentials.token,
                        StartTime: credentials.start_time,
                        ExpiredTime: credentials.expire_time
                    });
                }
            });
            const uploadTasks = layers.map(async (layer) => {
                const cleanName = layer.name.replace(/ \(可标注\)/g, '').replace(/ \(参考层\)/g, '').replace(/\.[^/.]+$/, "");
                const targetFilename = `${cleanName}.zip`;
                const targetFile = uploadFiles.find((f: any) => f.filename === targetFilename);
                if (!targetFile) return;
                if (!layer.cloudObjectKey) {
                    layer.cloudObjectKey = targetFile.object_key;
                    layer.cloudFileName = targetFile.filename;
                }

                const zip = new JSZip();

                if (layer.originalFiles) {
                    for (const [name, data] of Object.entries(layer.originalFiles)) {
                        let fileData = data;
                        if (name.toLowerCase().endsWith(".dbf") && layer.type === 'grid') {
                            const features = Array.isArray(layer.data) ? layer.data : (layer.data.type === 'FeatureCollection' ? layer.data.features : []);
                            fileData = updateDbfBinary(new Uint8Array(data), features, gridStates, buildingStates);
                        }
                        zip.file(name, fileData);
                    }
                }
                const geojsonToUpload = JSON.parse(JSON.stringify(layer.data));
                if (geojsonToUpload.features) {
                    geojsonToUpload.features.forEach((f: any) => {
                        const gs = gridStates[f.id] || 0;
                        const bs = buildingStates[f.id] || 0;
                        f.properties = f.properties || {};
                        f.properties.road_state = gs === 1 ? 1 : (gs === 2 ? 0 : -1);
                        f.properties.building_state = bs === 1 ? 1 : (bs === 2 ? 0 : -1);
                    });
                }
                zip.file("v_labels.json", JSON.stringify(geojsonToUpload));
                const blob = await zip.generateAsync({ type: "blob" });
                return new Promise<void>((resolve, reject) => {
                    cos.putObject({ Bucket: cos_info.bucket, Region: cos_info.region, Key: targetFile.object_key, Body: blob }, (err: any) => {
                        if (err) reject(err); else resolve();
                    });
                });
            });
            await Promise.all(uploadTasks);
            if (!silent) {
                setSaveStatus('success');
                setTimeout(() => {
                    setSaveStatus('idle');
                    setIsSaving(false);
                }, 2000);
            }
        } catch (err: any) {
            console.error("[Cloud] 同步错误:", err);
            if (!silent) {
                setSaveStatus('error');
                setIsSaving(false);
            }
        }
    }, [user, gridStates, buildingStates]);

    const handleManualSave = async () => {
        if (user) await syncAllToCloud();
    };
    const handleAutoSync = useCallback(async (targetUser: User) => {
        setIsSyncing(true);
        setCustomLayers([]);
        try {
            const syncData = await api.getMyCloudFiles();
            const { files, credentials, cos_info } = syncData;
            if (!files || files.length === 0) {
                setIsSyncing(false);
                return;
            }
            const cos = new COS({
                getAuthorization: (_: COS.GetAuthorizationOptions, callback: (params: COS.GetAuthorizationCallbackParams) => void) => {
                    callback({
                        TmpSecretId: credentials.secret_id,
                        TmpSecretKey: credentials.secret_key,
                        XCosSecurityToken: credentials.token,
                        SecurityToken: credentials.token,
                        StartTime: credentials.start_time,
                        ExpiredTime: credentials.expire_time
                    });
                }
            });
            const downloadAndRender = files.map((file: { filename: string; object_key: string }) => {
                return new Promise<void>((resolve) => {
                    cos.getObject({ Bucket: cos_info.bucket, Region: cos_info.region, Key: file.object_key, DataType: 'arraybuffer' }, (err: COS.CosError, data: COS.GetObjectResult) => {
                        if (err) resolve(); else {
                            (async () => {
                                try {
                                    const body = data && data.Body;
                                    if (body) {
                                        let bodyBuffer: ArrayBuffer | null = null
                                        if (body instanceof ArrayBuffer)
                                            bodyBuffer = body
                                        else if (body instanceof Blob)
                                            bodyBuffer = await body.arrayBuffer()
                                        else
                                            bodyBuffer = stringToArrayBuffer(body)

                                        if (bodyBuffer)
                                            processFileData(file.filename, bodyBuffer, targetUser, file.object_key)
                                    }
                                } catch (e) {
                                    console.warn(`[Sync] 跳过文件: ${file.filename}`, e);
                                }
                                resolve();
                            })();
                        }
                    });
                });
            });
            await Promise.all(downloadAndRender);
        } catch (err) {
            console.error("[Sync] 失败", err);
        } finally {
            setIsSyncing(false);
        }
    }, []);

    const processFileData = async (fileName: string, buffer: ArrayBuffer, targetUser: User, cloudObjectKey?: string) => {
        const fileExt = fileName.split('.').pop()?.toLowerCase();
        const fileNameBase = fileName.substring(0, fileName.lastIndexOf('.')) || fileName;
        let geojson: any = null;
        let originalFiles: Record<string, Uint8Array> = {};
        if (fileExt === 'zip') {
            try {
                const zip = await JSZip.loadAsync(buffer);
                const filePromises: Promise<void>[] = [];
                zip.forEach((relativePath: string, file: any) => {
                    filePromises.push(file.async("uint8array").then((data: Uint8Array) => {
                        originalFiles[relativePath] = data;
                    }));
                });
                await Promise.all(filePromises);
                if (originalFiles['v_labels.json']) geojson = JSON.parse(new TextDecoder().decode(originalFiles['v_labels.json']));
                else {
                    try {
                        geojson = await shp(buffer);
                    } catch (e) {
                        return;
                    }
                }
            } catch (e) {
                return;
            }
        } else if (fileExt === 'json' || fileExt === 'geojson') {
            geojson = JSON.parse(new TextDecoder().decode(buffer));
        }

        if (geojson) {
            const userPath = `users_data/${targetUser.id}/`;
            let polygonsToAdd: any[] = [];
            let referenceFeatures: any[] = [];
            const findIdKey = (feats: any[]) => {
                if (!feats || feats.length === 0) return "";
                const candidates = [
                    'FID', 'fid', 'OBJECTID', 'objectid', 'FID_1', 'OBJECTID_1', 'ID', 'id', 'Id',
                    'INDEX', 'index', 'NO', 'no', 'UUID', 'uuid', 'GUID', 'guid'
                ];
                const sampleSize = Math.min(feats.length, 10);
                for (const key of candidates) {
                    for (let i = 0; i < sampleSize; i++) {
                        if (feats[i].properties && key in feats[i].properties) return key;
                    }
                }
                const allKeys = Object.keys(feats[0].properties || {});
                return allKeys.find(k => k.toLowerCase().includes('id') || k.toLowerCase().includes('fid')) || "";
            };
            let sampleFeats = Array.isArray(geojson) ? (geojson[0]?.features || geojson) : (geojson.features || [geojson]);
            const detectedIdKeyName = findIdKey(sampleFeats);

            let featureIndex = 0;
            const traverse = (obj: any) => {
                if (!obj) return;
                if (obj.type === 'FeatureCollection' && Array.isArray(obj.features)) obj.features.forEach(traverse);
                else if (Array.isArray(obj)) obj.forEach(traverse);
                else if (obj.type === 'Feature') {
                    featureIndex++;
                    const geomType = obj.geometry?.type;

                    if (detectedIdKeyName && obj.properties && obj.properties[detectedIdKeyName] !== undefined) {
                        obj.id = String(obj.properties[detectedIdKeyName]);
                    } else if (obj.properties?.id !== undefined) {
                        obj.id = String(obj.properties.id);
                    } else if (obj.properties?.ID !== undefined) {
                        obj.id = String(obj.properties.ID);
                    } else {
                        obj.id = String(featureIndex);
                    }

                    if (obj.properties) {
                        const rVal = obj.properties.ROAD || obj.properties.road_state;
                        if (rVal === "1" || rVal === 1) setGridStates(prev => ({ ...prev, [obj.id]: 1 })); else if (rVal === "0" || rVal === 0) setGridStates(prev => ({ ...prev, [obj.id]: 2 }));
                        const bVal = obj.properties.BUILDING || obj.properties.building_state;
                        if (bVal === "1" || bVal === 1) setBuildingStates(prev => ({ ...prev, [obj.id]: 1 })); else if (bVal === "0" || bVal === 0) setBuildingStates(prev => ({ ...prev, [obj.id]: 2 }));
                    }
                    if (geomType === 'Polygon' || geomType === 'MultiPolygon') polygonsToAdd.push(obj); else referenceFeatures.push(obj);
                }
            };
            traverse(geojson);
            if (polygonsToAdd.length > 0) {
                const newLayerId = `${userPath}grid_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
                const newLayer: ExtendedCustomLayer = {
                    id: newLayerId,
                    userId: targetUser.id,
                    name: fileNameBase + " (可标注)",
                    sourceFileName: fileName,
                    cloudObjectKey,
                    cloudFileName: fileName,
                    type: 'grid',
                    data: { type: 'FeatureCollection', features: polygonsToAdd } as any,
                    timestamp: Date.now(),
                    visible: true,
                    originalFiles,
                    idKeyName: detectedIdKeyName
                };
                setCustomLayers(prev => [...prev, newLayer]);
                setGridDataVersion(v => v + 1);
                setActiveLayerId(newLayerId);
            }
            if (referenceFeatures.length > 0) {
                const newRefLayer: ExtendedCustomLayer = {
                    id: `${userPath}ref_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                    userId: targetUser.id,
                    name: fileNameBase + " (参考层)",
                    sourceFileName: fileName,
                    cloudObjectKey,
                    cloudFileName: fileName,
                    type: 'reference',
                    data: { type: "FeatureCollection", features: referenceFeatures } as any,
                    timestamp: Date.now(),
                    visible: true,
                    originalFiles
                };
                setCustomLayers(prev => [...prev, newRefLayer]);
            }
        }
    };

    const executeDeleteLayer = async () => {
        if (!layerToDeleteId || !user) return;
        const layerId = layerToDeleteId;
        const layerToDelete = customLayers.find(l => l.id === layerId);
        if (!layerToDelete || layerToDelete.userId !== user.id) return;
        if (layerToDelete.cloudObjectKey && layerToDelete.cloudFileName) {
            if (window.confirm("确认删除云端数据吗？")) {
                setIsDeleting(true);
                try {
                    const delData = await api.deleteCloudFileCredentials(layerToDelete.cloudFileName, layerToDelete.cloudObjectKey);
                    const { credentials, cos_info } = delData;
                    const cos = new COS({
                        getAuthorization: (_: COS.GetAuthorizationOptions, cb: (params: COS.GetAuthorizationCallbackParams) => void) => cb({
                            TmpSecretId: credentials.secret_id,
                            TmpSecretKey: credentials.secret_key,
                            XCosSecurityToken: credentials.token,
                            SecurityToken: credentials.token,
                            StartTime: credentials.start_time,
                            ExpiredTime: credentials.expire_time
                        })
                    });
                    await new Promise<void>((res, rej) => {
                        cos.deleteObject({ Bucket: cos_info.bucket, Region: cos_info.region, Key: layerToDelete.cloudObjectKey! }, (err: any) => err ? rej(err) : res());
                    });
                } catch (e: any) {
                    alert(`删除失败: ${e.message}`);
                    setIsDeleting(false);
                    return;
                } finally {
                    setIsDeleting(false);
                }
            } else {
                setLayerToDeleteId(null);
                return;
            }
        }
        setCustomLayers(prev => prev.filter(l => l.id !== layerId));
        if (activeLayerId === layerId) {
            setActiveLayerId(null);
            setSelectedFeatureId(null);
        }
        setGridDataVersion(v => v + 1);
        setLayerToDeleteId(null);
    };

    const handleLoginSuccess = (userData: User) => {
        setUser(userData);
        localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(userData));
        setShowAuthModal(false);
        handleAutoSync(userData);
        setShowTour(true);
    };
    useEffect(() => {
        const checkSession = async () => {
            const currentUser = await api.checkLoginStatus();
            if (currentUser) {
                setUser(currentUser);
                handleAutoSync(currentUser);
                setShowTour(true);
            }
        };
        checkSession();
    }, [handleAutoSync]);
    useEffect(() => {
        if (geoJsonRef.current) {
            geoJsonRef.current.eachLayer((layer: any) => {
                const id = layer.feature.id;
                if (id !== selectedFeatureId) layer.setStyle(getFeatureStyle(gridStates[id] || 0, buildingStates[id] || 0));
            });
        }
    }, [gridStates, buildingStates, selectedFeatureId]);
    const handleGridClick = (e: any) => {
        const id = e.target.feature.id;
        const { gridStates: cg, buildingStates: cb, labelMode: cm } = stateRef.current;
        let nr = cg[id] || 0;
        let nb = cb[id] || 0;
        if (cm === 'road') {
            if (nr === 0) nr = 2; else if (nr === 2) nr = 1; else nr = 0;
            setGridStates(p => ({ ...p, [id]: nr }));
        } else {
            if (nb === 0) nb = 2; else if (nb === 2) nb = 1; else nb = 0;
            setBuildingStates(p => ({ ...p, [id]: nb }));
        }
        if (id !== selectedFeatureId) e.target.setStyle(getFeatureStyle(nr, nb));
    };

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        if (!user) {
            alert("请先登录系统后再上传数据。");
            return;
        }

        const input = event.target;
        const files = input.files;

        if (!files || files.length === 0) return;

        const file = files[0];
        const fileName = file.name;

        // 使用标准 FileReader 进行跨浏览器安全读取，避免特定的 Webkit API 依赖
        const reader = new FileReader();

        reader.onload = async (e) => {
            const result = e.target?.result;
            if (!result) return;

            try {
                const resultBuffer = result instanceof ArrayBuffer ? result : stringToArrayBuffer(result);
                await processFileData(fileName, resultBuffer, user);
            } catch (err: any) {
                console.error("[Upload] 处理文件失败:", err);
                alert(`文件解析失败: ${err.message || '格式不正确'}`);
            } finally {
                // 处理完成后重置 input 值，允许重复上传同一文件，修复部分浏览器缓存导致无法连续上传的问题
                if (input) input.value = '';
            }
        };

        reader.onerror = () => {
            alert("文件读取过程中发生错误，请检查文件权限或重试。");
            if (input) input.value = '';
        };

        // 采用通用 ArrayBuffer 模式，确保在 Firefox/Safari/Chrome 中都能稳定解析二进制数据
        reader.readAsArrayBuffer(file);
    };

    if (!user) return (<> <LandingPage onStart={() => setShowAuthModal(true)} /> <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} onLoginSuccess={handleLoginSuccess} /> </>);

    return (
        <div className="relative w-full h-full bg-slate-900 overflow-hidden text-slate-900 font-sans">
            {isSyncing && (<div className="fixed inset-0 z-[4000] bg-slate-900/60 backdrop-blur-md flex flex-col items-center justify-center text-white space-y-4"><Loader2
                className="w-12 h-12 animate-spin text-emerald-400" />
                <div className="text-xl font-bold tracking-widest animate-pulse">正在同步云端数据...</div>
            </div>)}
            {(isSaving || isDeleting) && (<div
                className="fixed top-20 left-1/2 -translate-x-1/2 z-[3000] bg-emerald-600 text-white px-6 py-2 rounded-full shadow-2xl flex items-center gap-3 animate-pulse border border-emerald-400">
                <Loader2 className="w-4 h-4 animate-spin" /> <span className="text-sm font-bold">{isDeleting ? '从云端删除中...' : '同步属性数据中...'}</span></div>)}
            <MapContainer center={[DEFAULT_LOCATION.lat, DEFAULT_LOCATION.lng]} zoom={DEFAULT_LOCATION.zoom} className="w-full h-full z-0" zoomControl={false}>
                <MapController onMoveEnd={(loc) => setCurrentLocation(loc)} targetLocation={targetLocation} />
                <LayersControl position="bottomright">
                    <LayersControl.BaseLayer checked name="Esri World Imagery"> <TileLayer attribution='Tiles &copy; Esri'
                        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                        maxNativeZoom={19} maxZoom={22} /> </LayersControl.BaseLayer>
                    <LayersControl.BaseLayer name="Jilin-1 Satellite"> <TileLayer attribution='&copy; 吉林一号'
                        url="https://api.jl1mall.com/getMap/{z}/{x}/{-y}?mk=3ddec00f5f435270285ffc7ad1a60ce5&tk=90c63bb328950455b770400257ad882a"
                        tms={true} maxNativeZoom={20} maxZoom={22} /> </LayersControl.BaseLayer>
                    <LayersControl.BaseLayer name="Google Satellite"> <TileLayer attribution='&copy; Google' url="https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}" maxNativeZoom={20} maxZoom={22} />
                    </LayersControl.BaseLayer>
                    <LayersControl.BaseLayer name="Tianditu Satellite"> <TileLayer attribution='&copy; Tianditu'
                        url="https://t{s}.tianditu.gov.cn/DataServer?T=img_w&x={x}&y={y}&l={z}&tk=4267820f43926eaf808d61dc07269beb"
                        subdomains="01234567" maxNativeZoom={18} maxZoom={22} /> </LayersControl.BaseLayer>
                    {referenceLayers.map(layer => (<LayersControl.Overlay checked key={layer.id} name={layer.name}> <GeoJSON data={layer.data} style={{ color: '#ec4899', weight: 2, fillOpacity: 0.1 }} />
                    </LayersControl.Overlay>))}
                </LayersControl>
                <ScaleControl position="bottomright" />
                <GeoJSON key={`grid-layer-${gridDataVersion}`} ref={geoJsonRef} data={activeGridFeatures as any} style={(f) => {
                    const id = f?.id as string;
                    if (id === selectedFeatureId) return { color: '#ec4899', weight: 4, opacity: 1, fillOpacity: 0.4, fillColor: '#ec4899' };
                    return getFeatureStyle(gridStates[id] || 0, buildingStates[id] || 0);
                }} onEachFeature={(_, l) => {
                    l.on({ click: handleGridClick });
                }} />
            </MapContainer>

            {/* Top Stats Strip */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] pointer-events-none flex flex-col items-center gap-2">
                <div className="pointer-events-auto bg-white/95 backdrop-blur-md px-5 py-2.5 rounded-full shadow-lg border border-slate-200 flex items-center gap-4 text-xs font-bold text-slate-700">
                    <div className="flex items-center gap-1.5">
                        <div className="w-4 h-4 rounded-sm bg-red-500"></div>
                        <span>有路: {stats.roadCount}</span></div>
                    <div className="flex items-center gap-1.5">
                        <div className="w-4 h-4 rounded-sm bg-green-500"></div>
                        <span>无路: {stats.noRoadCount}</span></div>
                    <div className="flex items-center gap-1.5">
                        <div className="w-4 h-4 border-2 border-yellow-400 bg-transparent rounded-[2px]"></div>
                        <span>有建筑: {stats.buildingCount}</span></div>
                    <div className="flex items-center gap-1.5">
                        <div className="w-4 h-4 border-2 border-blue-500 bg-transparent rounded-[2px]"></div>
                        <span>无建筑: {stats.noBuildingCount}</span></div>
                </div>
            </div>

            {/* Left Panels (Aligned Width) */}
            <div className="absolute top-4 left-4 z-[1000] flex flex-col gap-3">
                <button onClick={handleManualSave} disabled={isSaving || isDeleting}
                    className="w-12 h-12 flex items-center justify-center bg-white rounded-xl shadow-xl border border-slate-200 text-slate-700 hover:text-emerald-600 transition-all active:scale-95">
                    {isSaving ? <Loader2 className="w-6 h-6 animate-spin" /> : <Save className="w-6 h-6" />}
                </button>

                {taskProgress && (
                    <div className="bg-white/95 w-48 rounded-2xl shadow-2xl border border-slate-100 flex flex-col overflow-hidden">
                        <div className="px-3 py-2.5 flex items-center justify-between border-b cursor-pointer" onClick={() => setIsTaskProgressExpanded(!isTaskProgressExpanded)}>
                            <div className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /><span
                                className="text-[10px] font-bold text-slate-700 truncate">进度</span></div>
                            {isTaskProgressExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </div>
                        {isTaskProgressExpanded && (
                            <div className="p-3 space-y-3">
                                <div className="space-y-1">
                                    <div className="flex justify-between items-center text-[9px] font-bold text-slate-500 mb-1">
                                        <div className="flex items-center gap-1.5">
                                            <div className="w-4 h-4 rounded-sm bg-red-500"></div>
                                            Road
                                        </div>
                                        <span className="tabular-nums">{taskProgress.markedRoad} / {taskProgress.total}</span>
                                    </div>
                                    <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden">
                                        <div className="h-full bg-red-500 transition-all" style={{ width: `${(taskProgress.markedRoad / taskProgress.total) * 100}%` }}></div>
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <div className="flex justify-between items-center text-[9px] font-bold text-slate-500 mb-1">
                                        <div className="flex items-center gap-1.5">
                                            <div className="w-4 h-4 border border-yellow-400 bg-transparent rounded-[1px]"></div>
                                            Building
                                        </div>
                                        <span className="tabular-nums">{taskProgress.markedBuilding} / {taskProgress.total}</span>
                                    </div>
                                    <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden">
                                        <div className="h-full bg-yellow-500 transition-all" style={{ width: `${(taskProgress.markedBuilding / taskProgress.total) * 100}%` }}></div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Attribute Table (Aligned with Task Progress Width) */}
                {attributeTableData && (
                    <div className={`bg-white/95 shadow-2xl border border-slate-200 rounded-xl overflow-hidden flex flex-col transition-all w-48 ${isTableOpen ? 'h-[400px]' : 'h-10'}`}>
                        <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b cursor-pointer" onClick={() => setIsTableOpen(!isTableOpen)}>
                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-700 shrink-0"><Table2 className="w-4 h-4 text-emerald-600 shrink-0" /><span
                                className="truncate">属性</span></div>
                            <Minimize2 className="w-3 h-3" />
                        </div>
                        {isTableOpen && (
                            <div className="flex-1 overflow-auto bg-white custom-scrollbar">
                                <table className="w-full text-[10px] text-left">
                                    <thead className="bg-slate-50 sticky top-0 text-[8px] text-slate-400 font-black tracking-widest uppercase">
                                        <tr>
                                            <th className="px-1.5 py-1.5 border-b">ID</th>
                                            <th className="px-1 py-1.5 border-b text-center">ROAD</th>
                                            <th className="px-1 py-1.5 border-b text-center">BUILDING</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {attributeTableData.rows.map((row: any) => {
                                            const rs = gridStates[row.id] || 0;
                                            const bs = buildingStates[row.id] || 0;
                                            return (
                                                <tr key={row.id} className={`cursor-pointer border-b hover:bg-slate-50 ${selectedFeatureId === row.id ? 'bg-pink-50 ring-1 ring-pink-200' : ''}`}
                                                    onClick={() => {
                                                        setSelectedFeatureId(row.id);
                                                        const coords = (row.geometry as any).coordinates[0];
                                                        if (coords) {
                                                            const al = coords.map((c: any) => c[1]).reduce((a: any, b: any) => a + b, 0) / coords.length;
                                                            const an = coords.map((c: any) => c[0]).reduce((a: any, b: any) => a + b, 0) / coords.length;
                                                            setTargetLocation({ lat: al, lng: an, zoom: 17 });
                                                        }
                                                    }}>
                                                    <td className="px-1.5 py-1.5 font-mono truncate max-w-[48px]">{row.displayId}</td>
                                                    <td className="px-1 py-1.5">
                                                        <div className="flex items-center justify-center gap-1.5">
                                                            {rs === 1 ? (
                                                                <>
                                                                    <div className="w-4 h-4 rounded-sm bg-red-500 shrink-0"></div>
                                                                    <span className="text-[9px]">1</span></>
                                                            ) : rs === 2 ? (
                                                                <>
                                                                    <div className="w-4 h-4 rounded-sm bg-green-500 shrink-0"></div>
                                                                    <span className="text-[9px]">0</span></>
                                                            ) : <span className="text-slate-200">-</span>}
                                                        </div>
                                                    </td>
                                                    <td className="px-1 py-1.5">
                                                        <div className="flex items-center justify-center gap-1.5">
                                                            {bs === 1 ? (
                                                                <>
                                                                    <div className="w-4 h-4 border-[1.5px] border-yellow-400 rounded-sm shrink-0"></div>
                                                                    <span className="text-[9px]">1</span></>
                                                            ) : bs === 2 ? (
                                                                <>
                                                                    <div className="w-4 h-4 border-[1.5px] border-blue-500 rounded-sm shrink-0"></div>
                                                                    <span className="text-[9px]">0</span></>
                                                            ) : <span className="text-slate-200">-</span>}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Top Right User Card */}
            <div className="absolute top-4 right-4 z-[1000] flex flex-col gap-3 items-end">
                <div className="bg-white/95 p-2 rounded-2xl shadow-xl border border-slate-100 flex flex-col min-w-[130px] transition-all">
                    <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-emerald-600 flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-sm border-2 border-white">
                                {user.nickname?.charAt(0).toUpperCase()}
                            </div>
                            <div className="flex flex-col overflow-hidden">
                                <span className="text-[13px] font-bold text-slate-800 truncate max-w-[70px]">
                                    {user.nickname}
                                </span>
                                <div className="text-[9px] text-slate-400 font-medium truncate flex items-center gap-1">
                                    <Mail className="w-2.5 h-2.5 opacity-60" />
                                    {user.email}
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={() => {
                                api.logout();
                                setUser(null);
                                localStorage.removeItem(STORAGE_KEY_USER);
                            }}
                            className="text-slate-300 hover:text-red-500 transition-colors p-1 hover:bg-red-50 rounded-lg"
                            title="退出登录"
                        >
                            <LogOut className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>

                <button id="tour-tools-toggle" onClick={() => setIsToolsOpen(!isToolsOpen)}
                    className="bg-white p-3 rounded-xl shadow-xl border flex items-center gap-2 font-bold text-sm hover:bg-slate-50 transition-colors"><Layers
                        className="w-4 h-4 text-emerald-600" />图层
                </button>
                {isToolsOpen && (
                    <div className="bg-white p-4 rounded-xl shadow-xl border w-64 space-y-4 max-h-[60vh] overflow-y-auto">
                        <div className="space-y-2 text-xs">
                            <div className="font-bold">上传数据</div>
                            {/* 增强跨浏览器兼容性：使用 sr-only 实现视觉隐藏，并完善 accept 的 MIME 类型支持 */}
                            <input
                                type="file"
                                id="shp-upload"
                                ref={fileInputRef}
                                accept=".zip,application/zip,application/x-zip-compressed,.json,application/json,.geojson"
                                onChange={handleFileUpload}
                                className="sr-only"
                                style={{
                                    position: 'absolute',
                                    width: '1px',
                                    height: '1px',
                                    padding: '0',
                                    margin: '-1px',
                                    overflow: 'hidden',
                                    clip: 'rect(0, 0, 0, 0)',
                                    whiteSpace: 'nowrap',
                                    borderWidth: '0'
                                }}
                            />
                            <label htmlFor="shp-upload" className="block p-4 border-2 border-dashed border-slate-300 rounded-xl hover:border-emerald-500 cursor-pointer text-center">上传 ZIP
                                (WGS84对齐)</label>
                        </div>
                        <div className="space-y-2 text-xs">
                            <div className="font-bold text-slate-400 uppercase">云端资产</div>
                            <div onClick={() => setActiveLayerId(null)}
                                className={`p-2 rounded-lg border cursor-pointer ${activeLayerId === null ? 'bg-emerald-50 border-emerald-500 font-bold' : ''}`}>默认网格
                            </div>
                            {customLayers.filter(l => l.userId === user.id).map(layer => (
                                <div key={layer.id} onClick={() => setActiveLayerId(layer.id)}
                                    className={`flex justify-between items-center p-2 rounded-lg border cursor-pointer ${activeLayerId === layer.id ? 'bg-emerald-50 border-emerald-500 font-bold' : ''}`}>
                                    <span className="truncate flex-1">{layer.name}</span>
                                    <button onClick={(e) => {
                                        e.stopPropagation();
                                        setLayerToDeleteId(layer.id);
                                    }} className="text-slate-300 hover:text-red-500 ml-2"><Trash2 className="w-3.5 h-3.5" /></button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Mode Switcher (Symmetric with Top Stats Strip) */}
            <div id="tour-mode-switch" className="absolute bottom-8 left-1/2 -translate-x-1/2 z-[1000]">
                <div className="bg-white/95 backdrop-blur-md px-1.5 py-1.5 rounded-full shadow-2xl border border-slate-200 flex items-center gap-1.5">
                    <button
                        onClick={() => setLabelMode('road')}
                        className={`px-4 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 transition-all ${labelMode === 'road' ? 'bg-red-500 text-white shadow-lg' : 'text-slate-600 hover:bg-slate-50'}`}
                    >
                        <Milestone className={`w-4 h-4 ${labelMode === 'road' ? 'text-white' : 'text-red-500'}`} /> 标路
                    </button>
                    <button
                        onClick={() => setLabelMode('building')}
                        className={`px-4 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 transition-all ${labelMode === 'building' ? 'bg-yellow-500 text-white shadow-lg' : 'text-slate-600 hover:bg-slate-50'}`}
                    >
                        <Building2 className={`w-4 h-4 ${labelMode === 'building' ? 'text-white' : 'text-yellow-500'}`} /> 标建筑
                    </button>
                </div>
            </div>

            <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} onLoginSuccess={handleLoginSuccess} />
            {showTour && <OnboardingTour onComplete={() => setShowTour(false)} />}
            {layerToDeleteId && (<div className="fixed inset-0 z-[3000] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 text-slate-900">
                <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-8 text-center space-y-5"><AlertTriangle className="w-12 h-12 text-red-500 mx-auto" /> <h3
                    className="text-xl font-bold">删除确认</h3><p className="text-sm text-slate-500">此操作将永久移除该数据，确认吗？</p>
                    <div className="grid grid-cols-2 gap-3 pt-2">
                        <button onClick={() => setLayerToDeleteId(null)} className="px-4 py-3 rounded-xl border font-bold">取消</button>
                        <button onClick={executeDeleteLayer} disabled={isDeleting} className="px-4 py-3 rounded-xl bg-red-500 text-white font-bold">{isDeleting ? '删除中...' : '确认删除'}</button>
                    </div>
                </div>
            </div>)}
        </div>
    );
}
