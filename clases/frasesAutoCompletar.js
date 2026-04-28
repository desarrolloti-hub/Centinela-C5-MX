// frasesAutoCompletar.js - CLASE COMPLETA PARA GESTIONAR FRASES DE AUTOCOMPLETADO

import { db } from '/config/firebase-config.js';
import { 
    collection, 
    doc, 
    getDocs, 
    getDoc, 
    setDoc, 
    updateDoc, 
    query, 
    where, 
    orderBy, 
    limit, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";
import consumo from '/clases/consumoFirebase.js';

class FrasesAutoCompletarManager {
    constructor() {
        this.coleccion = 'frasesAutoCompletar';
    }

    /**
     * Guarda o actualiza una frase en la colección
     * @param {string} texto - Descripción completa
     * @param {string} categoriaId - ID de la categoría
     * @param {string} subcategoriaId - ID de la subcategoría
     * @param {string} organizacion - Organización en camelCase
     * @param {object} usuarioActual - Objeto del usuario
     * @returns {Promise<{exito: boolean, id?: string, veces?: number}>}
     */
    async guardarFrase(texto, categoriaId, subcategoriaId, organizacion, usuarioActual = null) {
        if (!texto || !categoriaId || !organizacion) {
            throw new Error('Faltan datos: texto, categoriaId, organizacion');
        }

        try {
            const coleccionRef = collection(db, this.coleccion);
            const q = query(
                coleccionRef,
                where('texto', '==', texto),
                where('categoriaId', '==', categoriaId),
                where('subcategoriaId', '==', subcategoriaId || ''),
                where('organizacion', '==', organizacion),
                limit(1)
            );
            
            const snapshot = await getDocs(q);
            
            if (!snapshot.empty) {
                const docRef = snapshot.docs[0].ref;
                const datosActuales = snapshot.docs[0].data();
                const nuevasVeces = (datosActuales.vecesUsada || 0) + 1;
                
                await updateDoc(docRef, {
                    vecesUsada: nuevasVeces,
                    fechaUltimaUso: serverTimestamp()
                });
                
                await consumo.registrarFirestoreActualizacion(this.coleccion, docRef.id);
                
                console.log(`📝 Frase actualizada: "${texto.substring(0, 50)}..." (${nuevasVeces} usos)`);
                return { exito: true, id: docRef.id, veces: nuevasVeces };
            } 
            else {
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
                
                console.log(`✨ Nueva frase creada: "${texto.substring(0, 50)}..."`);
                return { exito: true, id: nuevoDocRef.id, veces: 1 };
            }
        } 
        catch (error) {
            console.error('❌ Error guardando frase:', error);
            throw error;
        }
    }

    /**
     * Obtiene frases sugeridas (vecesUsada >= 3)
     * @param {string} organizacion - Organización en camelCase
     * @param {string} categoriaId - ID de categoría (opcional)
     * @param {string} subcategoriaId - ID de subcategoría (opcional)
     * @param {number} limite - Máximo de resultados
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
            
            if (categoriaId && categoriaId !== '') {
                constraints.unshift(where('categoriaId', '==', categoriaId));
            }
            if (subcategoriaId && subcategoriaId !== '') {
                constraints.unshift(where('subcategoriaId', '==', subcategoriaId));
            }

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
            
            console.log(`📊 Frases sugeridas obtenidas: ${resultados.length} (org: ${organizacion}, cat: ${categoriaId || 'todas'})`);
            return resultados;
        } 
        catch (error) {
            console.error('❌ Error obteniendo frases sugeridas:', error);
            return [];
        }
    }

    /**
     * Incrementa el contador de usos de una frase
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
                console.log(`📈 Incrementado uso de frase: ${id} -> ${vecesActual + 1}`);
            }
        } 
        catch (error) {
            console.error('❌ Error incrementando uso:', error);
        }
    }

    /**
     * Obtiene frases por categoría específica
     * @param {string} organizacion 
     * @param {string} categoriaId 
     * @param {number} limite 
     * @returns {Promise<Array>}
     */
    async obtenerFrasesPorCategoria(organizacion, categoriaId, limite = 20) {
        return this.obtenerFrasesSugeridas(organizacion, categoriaId, '', limite);
    }

    /**
     * Obtiene frases por subcategoría específica
     * @param {string} organizacion 
     * @param {string} categoriaId 
     * @param {string} subcategoriaId 
     * @param {number} limite 
     * @returns {Promise<Array>}
     */
    async obtenerFrasesPorSubcategoria(organizacion, categoriaId, subcategoriaId, limite = 20) {
        return this.obtenerFrasesSugeridas(organizacion, categoriaId, subcategoriaId, limite);
    }

    /**
     * Obtiene las frases más populares de la organización
     * @param {string} organizacion 
     * @param {number} limite 
     * @returns {Promise<Array>}
     */
    async obtenerFrasesPopulares(organizacion, limite = 10) {
        if (!organizacion) return [];
        
        try {
            const q = query(
                collection(db, this.coleccion),
                where('organizacion', '==', organizacion),
                where('activa', '==', true),
                where('vecesUsada', '>=', 5),
                orderBy('vecesUsada', 'desc'),
                limit(limite)
            );
            
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
        } 
        catch (error) {
            console.error('❌ Error obteniendo frases populares:', error);
            return [];
        }
    }
}

export { FrasesAutoCompletarManager };