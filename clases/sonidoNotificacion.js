// /clases/sonidoNotificacion.js
// Sistema de sonidos con cola de reproducción (uno a la vez, sin bucles)
// CORREGIDO: Mapeo correcto de sonidos para seguimientos

import { storage } from "/config/firebase-config.js";
import {
    ref,
    listAll,
    getDownloadURL,
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-storage.js";

export class SonidoNotificacion {
    constructor() {
        this.audioElements = new Map();
        this.soundUrls = new Map();
        this.soundConfigs = new Map();
        this.initialized = false;
        this.defaultVolume = 0.7;
        this.availableSounds = [];

        // ========== COLA DE REPRODUCCIÓN ==========
        this.queue = [];
        this.isPlaying = false;
        this.currentAudio = null;

        // ========== MAPEO DE ARCHIVOS A IDs ==========
        this.fileNameMapping = {
            "voz medica": "alarma-medica",
            "voz intusion": "alarma-intrusion",
            "voz incendio": "alarma-incendio",
            "voz robo": "alarma-robo",
            "voz apertura": "apertura",
            "voz cierre": "cierre",
            "voz problema en sistema": "problema-sistema",
            "voz prueba periodica": "prueba-periodica",
            "voz dispositivo deshabilitado": "dispositivo-deshabilitado",
            "voz dispositivo habilitado": "dispositivo-habilitado",
            "voz nueva incidencia": "nueva-incidencia",
            "voz nuevo seguimiento": "nuevo-seguimiento",
            "voz notificacion": "notificacion-general",
            "voz tarea pendiente": "tarea-pendiente",
            "voz general": "general",
        };

        this.volumeConfig = {
            "alarma-medica": 0.95,
            "alarma-intrusion": 0.9,
            "alarma-incendio": 0.95,
            "alarma-robo": 0.9,
            apertura: 0.6,
            cierre: 0.6,
            "problema-sistema": 0.7,
            "prueba-periodica": 0.5,
            "dispositivo-deshabilitado": 0.5,
            "dispositivo-habilitado": 0.5,
            "nueva-incidencia": 0.7,
            "nuevo-seguimiento": 0.65,
            "notificacion-general": 0.55,
            "tarea-pendiente": 0.6,
            general: 0.6,
        };

        this.namesConfig = {
            "alarma-medica": "🚨 Alarma Médica",
            "alarma-intrusion": "🔔 Alarma de Intrusión",
            "alarma-incendio": "🔥 Alarma de Incendio",
            "alarma-robo": "⚠️ Alarma de Robo",
            apertura: "🔓 Apertura",
            cierre: "🔒 Cierre",
            "problema-sistema": "⚙️ Problema en Sistema",
            "prueba-periodica": "🧪 Prueba Periódica",
            "dispositivo-deshabilitado": "❌ Dispositivo Deshabilitado",
            "dispositivo-habilitado": "✅ Dispositivo Habilitado",
            "nueva-incidencia": "📋 Nueva Incidencia",
            "nuevo-seguimiento": "🔄 Nuevo Seguimiento",
            "notificacion-general": "🔔 Notificación",
            "tarea-pendiente": "📌 Tarea Pendiente",
            general: "🔊 General",
        };

        this.init();
    }

    async init() {
        if (this.initialized) return;
        await this.scanAvailableSounds();
        this.initialized = true;
    }

    async scanAvailableSounds() {
        try {
            const folderRef = ref(storage, "audios/notificaciones/");
            const result = await listAll(folderRef);

            for (const itemRef of result.items) {
                const fullPath = itemRef.fullPath;
                const fileName = fullPath
                    .split("/")
                    .pop()
                    .replace(".mp3", "")
                    .replace(".wav", "")
                    .replace(".ogg", "");

                let soundId =
                    this.fileNameMapping[fileName] ||
                    fileName.toLowerCase().replace(/\s+/g, "-");

                const url = await getDownloadURL(itemRef);
                this.soundUrls.set(soundId, url);

                const audio = new Audio();
                audio.preload = "auto";
                audio.src = url;
                audio.volume = this.volumeConfig[soundId] || 0.6;
                audio.load();

                this.audioElements.set(soundId, audio);

                this.soundConfigs.set(soundId, {
                    name: this.namesConfig[soundId] || this.formatSoundName(fileName),
                    path: fullPath,
                    volume: this.volumeConfig[soundId] || 0.6,
                    url: url,
                    fileName: fileName,
                });

                this.availableSounds.push(soundId);
            }
        } catch (error) {
            console.error("❌ Error escaneando sonidos:", error);
        }
    }

    formatSoundName(soundName) {
        return soundName
            .split("-")
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(" ");
    }

    async initialize() {
        await this.init();
        return true;
    }

    determinarSonidoParaNotificacion(notificacion) {
        // 1. Eventos de monitoreo
        if (
            notificacion.eventId ||
            notificacion.detalles?.eventId ||
            notificacion.tipo === "evento_monitoreo" ||
            notificacion.tipo === "alarma"
        ) {
            const typeId = notificacion.typeId || notificacion.detalles?.type_id || 0;
            const description = (
                notificacion.eventDescription ||
                notificacion.detalles?.description ||
                ""
            ).toLowerCase();

            // Alarma Médica (584)
            if (
                typeId === 584 ||
                description.includes("medical") ||
                description.includes("medica")
            ) {
                return "alarma-medica";
            }

            // Incendio (type_id 100-111 o palabra clave "fire")
            if (
                (typeId >= 100 && typeId <= 111) ||
                description.includes("incendio") ||
                description.includes("fuego") ||
                description.includes("fire")
            ) {
                return "alarma-incendio";
            }

            // Intrusión/Robo (130-135)
            if (typeId >= 130 && typeId <= 135) {
                return description.includes("robo")
                    ? "alarma-robo"
                    : "alarma-intrusion";
            }

            // Apertura (también por descripción ampliada)
            if (
                (typeId >= 400 && typeId <= 499) ||
                description.includes("open") ||
                description.includes("apertura")
            ) {
                const esCierre =
                    description.includes("close") ||
                    description.includes("clos") ||      // ← detecta "closings"
                    description.includes("cierre") ||
                    description.includes("restore") ||
                    description.includes("restauración");
                return esCierre ? "cierre" : "apertura";
            }

            // Cierre (por descripción fuera del rango 400-499)
            if (
                description.includes("close") ||
                description.includes("clos") ||           // ← detecta "closings"
                description.includes("cierre") ||
                description.includes("restore") ||
                description.includes("restauración")
            ) {
                return "cierre";
            }

            // Problema Sistema (300-399)
            if (typeId >= 300 && typeId <= 399) {
                return "problema-sistema";
            }

            // Prueba (600-699)
            if (typeId >= 600 && typeId <= 699) {
                return "prueba-periodica";
            }

            // Bypass/Deshabilitar
            if (
                description.includes("bypass") ||
                description.includes("deshabilit")
            ) {
                return "dispositivo-deshabilitado";
            }

            // Enable/Habilitar
            if (description.includes("enable") || description.includes("habilit")) {
                return "dispositivo-habilitado";
            }

            return "general";
        }

        // 2. Incidencias
        if (
            notificacion.incidenciaId ||
            notificacion.tipo === "canalizacion" ||
            notificacion.tipo === "incidencia"
        ) {
            return "nueva-incidencia";
        }

        // 3. Seguimientos
        if (
            notificacion.tipo === "seguimiento" ||
            notificacion.tipo === "actualizacion" ||
            notificacion.tipo === "comentario"
        ) {
            return "nuevo-seguimiento";
        }

        // 4. Tareas
        if (notificacion.tipo === "asignacion" || notificacion.tipo === "tarea") {
            return "tarea-pendiente";
        }

        // 5. Nivel de riesgo crítico
        if (
            notificacion.nivelRiesgo === "critico" ||
            notificacion.prioridad === "alta"
        ) {
            return "alarma-intrusion";
        }

        return "notificacion-general";
    }

    async play(soundId, volume = null) {
        if (!this.initialized) await this.init();

        if (!this.audioElements.has(soundId) && soundId !== "general") {
            soundId = "general";
        }

        if (!this.audioElements.has(soundId)) {
            console.warn(`🔇 Sonido no disponible: ${soundId}`);
            return null;
        }

        const queueItem = {
            id: `${soundId}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            soundId: soundId,
            volume: volume,
        };

        this.queue.push(queueItem);

        if (!this.isPlaying) {
            this._processQueue();
        }

        return queueItem.id;
    }

    async _processQueue() {
        if (this.isPlaying || this.queue.length === 0) return;

        this.isPlaying = true;

        while (this.queue.length > 0) {
            const item = this.queue.shift();

            try {
                await this._playSingle(item.soundId, item.volume);
            } catch (error) {
                console.debug("Error reproduciendo:", error);
            }

            await new Promise((r) => setTimeout(r, 300));
        }

        this.isPlaying = false;
        this.currentAudio = null;
    }

    async _playSingle(soundId, volume = null) {
        return new Promise((resolve) => {
            const audio = this.audioElements.get(soundId);
            if (!audio) {
                resolve();
                return;
            }

            const audioClone = audio.cloneNode();
            const config = this.soundConfigs.get(soundId);
            const targetVolume =
                volume !== null ? volume : config?.volume || this.defaultVolume;

            audioClone.volume = Math.min(1, Math.max(0, targetVolume));
            audioClone.loop = false;

            this.currentAudio = audioClone;

            const onEnd = () => {
                audioClone.removeEventListener("ended", onEnd);
                audioClone.removeEventListener("error", onError);
                this.currentAudio = null;
                resolve();
            };

            const onError = (e) => {
                audioClone.removeEventListener("ended", onEnd);
                audioClone.removeEventListener("error", onError);
                this.currentAudio = null;
                resolve();
            };

            audioClone.addEventListener("ended", onEnd);
            audioClone.addEventListener("error", onError);

            audioClone.play().catch(() => resolve());
        });
    }

    async playForNotificacion(notificacion, volume = null) {
        const soundId = this.determinarSonidoParaNotificacion(notificacion);
        return await this.play(soundId, volume);
    }

    stopAll() {
        this.queue = [];
        if (this.currentAudio) {
            try {
                this.currentAudio.pause();
                this.currentAudio.currentTime = 0;
            } catch (e) { }
            this.currentAudio = null;
        }
        this.isPlaying = false;
    }

    setGlobalVolume(volume) {
        this.defaultVolume = Math.max(0, Math.min(1, volume));
    }

    setEnabled(enabled) {
        if (!enabled) {
            this.stopAll();
        }
    }

    getAvailableSounds() {
        return this.availableSounds.map((soundId) => ({
            id: soundId,
            name: this.soundConfigs.get(soundId)?.name || soundId,
            volume: this.soundConfigs.get(soundId)?.volume || 0.6,
            exists: true,
        }));
    }

    getQueueLength() {
        return this.queue.length;
    }

    isCurrentlyPlaying() {
        return this.isPlaying;
    }
}

export const sonidoNotificacion = new SonidoNotificacion();
