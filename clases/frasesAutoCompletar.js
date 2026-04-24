// /clases/frasesAutoCompletar.js
import { db } from '/config/firebase-config.js';
import { collection, doc, getDocs, getDoc, setDoc, updateDoc, query, where, orderBy, limit, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";
import consumo from '/clases/consumoFirebase.js';

class FrasesAutoCompletarManager {
    constructor() {
        this.coleccion = 'frasesAutoCompletar'; // nombre de la colección en Firestore
    }

    /**
     * Guarda o actualiza una frase (descripción) en la colección.
     * Si ya existe el mismo texto + categoría + subcategoría + organización,
     * incrementa el contador 'vecesUsada'. Si no, crea un nuevo documento.
     * @param {string} texto - Descripción completa
     * @param {string} categoriaId - ID de la categoría
     * @param {string} subcategoriaId - ID de la subcategoría
     * @param {string} organizacion - Organización en camelCase
     * @param {object} usuarioActual - Objeto del usuario (opcional)
     * @returns {Promise<{exito: boolean, id?: string, veces?: number}>}
     */
    async guardarFrase(texto, categoriaId, subcategoriaId, organizacion, usuarioActual = null) {
        if (!texto || !categoriaId || !organizacion) {
            throw new Error('Faltan datos obligatorios: texto, categoriaId, organizacion');
        }

        try {
            const coleccionRef = collection(db, this.coleccion);
            // Buscar documento existente con exactamente los mismos campos
            const q = query(
                coleccionRef,
                where('texto', '==', texto),
                where('categoriaId', '==', categoriaId),
                where('subcategoriaId', '==', subcategoriaId),
                where('organizacion', '==', organizacion),
                limit(1)
            );
            const snapshot = await getDocs(q);
            
            if (!snapshot.empty) {
                // Ya existe: actualizar vecesUsada y fechaUltimaUso
                const docRef = snapshot.docs[0].ref;
                const datosActuales = snapshot.docs[0].data();
                const nuevasVeces = (datosActuales.vecesUsada || 0) + 1;
                await updateDoc(docRef, {
                    vecesUsada: nuevasVeces,
                    fechaUltimaUso: serverTimestamp()
                });
                await consumo.registrarFirestoreActualizacion(this.coleccion, docRef.id);
                return { exito: true, id: docRef.id, veces: nuevasVeces };
            } else {
                // Crear nuevo documento
                const nuevoDocRef = doc(coleccionRef);
                const nuevoDocumento = {
                    texto,
                    categoriaId,
                    subcategoriaId: subcategoriaId || '',
                    organizacion,
                    vecesUsada: 1,
                    activa: true,
                    fechaCreacion: serverTimestamp(),
                    fechaUltimaUso: serverTimestamp()
                };
                await setDoc(nuevoDocRef, nuevoDocumento);
                await consumo.registrarFirestoreEscritura(this.coleccion, nuevoDocRef.id);
                return { exito: true, id: nuevoDocRef.id, veces: 1 };
            }
        } catch (error) {
            console.error('Error guardando frase en colección de autocompletado:', error);
            throw error;
        }
    }

    /**
     * Obtiene frases sugeridas (solo con vecesUsada >= 3) 
     * ordenadas por popularidad descendente.
     * @param {string} organizacion - Organización en camelCase
     * @param {string} categoriaId - ID de la categoría (opcional)
     * @param {string} subcategoriaId - ID de la subcategoría (opcional)
     * @param {number} limite - Cantidad máxima de resultados (default 30)
     * @returns {Promise<Array<{texto: string, vecesUsada: number, id: string}>>}
     */
    async obtenerFrasesSugeridas(organizacion, categoriaId = '', subcategoriaId = '', limite = 30) {
        if (!organizacion) return [];

        try {
            let constraints = [
                where('organizacion', '==', organizacion),
                where('activa', '==', true),
                where('vecesUsada', '>=', 3),
                orderBy('vecesUsada', 'desc'),
                limit(limite)
            ];
            if (categoriaId) constraints.unshift(where('categoriaId', '==', categoriaId));
            if (subcategoriaId) constraints.unshift(where('subcategoriaId', '==', subcategoriaId));

            const q = query(collection(db, this.coleccion), ...constraints);
            const snapshot = await getDocs(q);
            const resultados = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                resultados.push({
                    id: doc.id,
                    texto: data.texto,
                    vecesUsada: data.vecesUsada || 0
                });
            });
            return resultados;
        } catch (error) {
            console.error('Error obteniendo frases sugeridas:', error);
            return [];
        }
    }

    /**
     * Incrementa manualmente el contador de usos de una frase.
     * @param {string} id - ID del documento
     * @returns {Promise<void>}
     */
    async incrementarUso(id) {
        if (!id) return;
        try {
            const docRef = doc(db, this.coleccion, id);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                const vecesActual = docSnap.data().vecesUsada || 0;
                await updateDoc(docRef, {
                    vecesUsada: vecesActual + 1,
                    fechaUltimaUso: serverTimestamp()
                });
                await consumo.registrarFirestoreActualizacion(this.coleccion, id);
            }
        } catch (error) {
            console.error('Error incrementando uso de frase:', error);
        }
    }
}

export { FrasesAutoCompletarManager };