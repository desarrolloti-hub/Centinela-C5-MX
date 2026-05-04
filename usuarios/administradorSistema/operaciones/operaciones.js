// operaciones.js - VERSIÓN COMPLETA SIN "GLOBAL"

import OperacionesEstadisticas from '/clases/operacion.js';

class OperacionesController {
    constructor() {
        this.charts = {};
        this.datosTodasEmpresas = null;
        this.empresaSeleccionada = 'todas';
        this.filtroActual = {
            empresa: 'todas',
            periodo: '',
            fechaInicio: null,
            fechaFin: null
        };

        this.init();
    }

    async init() {
        this.bindEvents();
        await this.cargarSelectores();

        OperacionesEstadisticas.onProgreso((progreso) => {
            this.actualizarProgreso(progreso);
        });

        await this.cargarDatosIniciales();
    }

    async cargarDatosIniciales() {
        try {
            this.datosTodasEmpresas = await OperacionesEstadisticas.obtenerDatosTodasEmpresas();

            this.actualizarTabla(this.datosTodasEmpresas.porEmpresa);
            this.actualizarGraficasComparativas(this.datosTodasEmpresas.porEmpresa);
            await this.mostrarVistaTodasEmpresas();

            const fechaElement = document.getElementById('fechaActualizacion');
            if (fechaElement && this.datosTodasEmpresas?.porEmpresa?.length > 0) {
                const fechas = this.datosTodasEmpresas.porEmpresa.map(e => e.fechaActualizacion);
                const masReciente = new Date(Math.max(...fechas));
                fechaElement.textContent = masReciente.toLocaleString();
            }
        } catch (error) {
            console.error('Error cargando datos iniciales:', error);
        }
    }

    async mostrarVistaTodasEmpresas() {
        if (!this.datosTodasEmpresas || !this.datosTodasEmpresas.totales) return;

        this.mostrarContenido();

        const totales = this.datosTodasEmpresas.totales;
        const totalArchivos = totales.storage.totalArchivos;

        this.actualizarElemento('metricDocumentos', totales.firestore.documentos);
        this.actualizarElemento('metricAdministradores', totales.auth.administradores);
        this.actualizarElemento('metricColaboradores', totales.auth.colaboradores);
        this.actualizarElemento('metricTotalUsuarios', totales.auth.totalUsuarios);
        this.actualizarElemento('metricArchivosTotales', totales.storage.totalArchivos);

        const tamanioElement = document.getElementById('metricTamanioTotal');
        if (tamanioElement) {
            tamanioElement.textContent = `${totales.storage.totalSizeMB.toFixed(2)} MB`;
        }

        this.actualizarElemento('metricPDF', totales.storage.porTipo.pdf.cantidad);
        this.actualizarElemento('metricPDFPorcentaje', totalArchivos > 0 ? `${((totales.storage.porTipo.pdf.cantidad / totalArchivos) * 100).toFixed(1)}%` : '0%');
        this.actualizarElemento('metricImagenes', totales.storage.porTipo.imagenes.cantidad);
        this.actualizarElemento('metricImagenesPorcentaje', totalArchivos > 0 ? `${((totales.storage.porTipo.imagenes.cantidad / totalArchivos) * 100).toFixed(1)}%` : '0%');
        this.actualizarElemento('metricDocumentosStorage', totales.storage.porTipo.documentos.cantidad);
        this.actualizarElemento('metricDocumentosPorcentaje', totalArchivos > 0 ? `${((totales.storage.porTipo.documentos.cantidad / totalArchivos) * 100).toFixed(1)}%` : '0%');
        this.actualizarElemento('metricMultimedia', totales.storage.porTipo.multimedia.cantidad);
        this.actualizarElemento('metricMultimediaPorcentaje', totalArchivos > 0 ? `${((totales.storage.porTipo.multimedia.cantidad / totalArchivos) * 100).toFixed(1)}%` : '0%');

        const labels = ['PDF', 'Imágenes', 'Documentos', 'Multimedia', 'Otros'];
        const data = [
            totales.storage.porTipo.pdf.cantidad,
            totales.storage.porTipo.imagenes.cantidad,
            totales.storage.porTipo.documentos.cantidad,
            totales.storage.porTipo.multimedia.cantidad,
            totales.storage.porTipo.otros.cantidad
        ];
        this.crearGraficaPastel('graficoTiposArchivo', labels, data);

        const modoVisualizacion = document.getElementById('modoVisualizacion');
        if (modoVisualizacion) {
            modoVisualizacion.innerHTML = `<i class="fas fa-chart-line"></i> <span>Todas las empresas</span>`;
        }
    }

    mostrarVistaTodasEmpresasConFiltro(empresas) {
        if (!empresas || empresas.length === 0) {
            this.mostrarSinDatos();
            return;
        }

        this.mostrarContenido();

        // Recalcular totales con las empresas filtradas
        const totales = {
            firestore: { documentos: 0, colecciones: 0 },
            storage: {
                totalArchivos: 0,
                totalSizeMB: 0,
                porTipo: {
                    pdf: { cantidad: 0, tamañoMB: 0 },
                    imagenes: { cantidad: 0, tamañoMB: 0 },
                    documentos: { cantidad: 0, tamañoMB: 0 },
                    multimedia: { cantidad: 0, tamañoMB: 0 },
                    otros: { cantidad: 0, tamañoMB: 0 }
                }
            },
            auth: { totalUsuarios: 0, administradores: 0, colaboradores: 0 }
        };

        empresas.forEach(emp => {
            const resumen = emp.getResumen();
            totales.firestore.documentos += emp.conteos.firestore.documentos;
            totales.firestore.colecciones += emp.conteos.firestore.colecciones;
            totales.storage.totalArchivos += resumen.archivosTotales;
            totales.storage.totalSizeMB += resumen.tamanioTotalMB;
            totales.auth.totalUsuarios += resumen.totalUsuarios;
            totales.auth.administradores += resumen.administradores;
            totales.auth.colaboradores += resumen.colaboradores;

            totales.storage.porTipo.pdf.cantidad += resumen.pdf.cantidad;
            totales.storage.porTipo.pdf.tamañoMB += resumen.pdf.tamanioMB;
            totales.storage.porTipo.imagenes.cantidad += resumen.imagenes.cantidad;
            totales.storage.porTipo.imagenes.tamañoMB += resumen.imagenes.tamanioMB;
            totales.storage.porTipo.documentos.cantidad += resumen.documentos.cantidad;
            totales.storage.porTipo.documentos.tamañoMB += resumen.documentos.tamanioMB;
            totales.storage.porTipo.multimedia.cantidad += resumen.multimedia.cantidad;
            totales.storage.porTipo.multimedia.tamañoMB += resumen.multimedia.tamanioMB;
            totales.storage.porTipo.otros.cantidad += resumen.otros.cantidad;
            totales.storage.porTipo.otros.tamañoMB += resumen.otros.tamanioMB;
        });

        const totalArchivos = totales.storage.totalArchivos;

        // Actualizar métricas
        this.actualizarElemento('metricDocumentos', totales.firestore.documentos);
        this.actualizarElemento('metricAdministradores', totales.auth.administradores);
        this.actualizarElemento('metricColaboradores', totales.auth.colaboradores);
        this.actualizarElemento('metricTotalUsuarios', totales.auth.totalUsuarios);
        this.actualizarElemento('metricArchivosTotales', totales.storage.totalArchivos);

        const tamanioElement = document.getElementById('metricTamanioTotal');
        if (tamanioElement) {
            tamanioElement.textContent = `${totales.storage.totalSizeMB.toFixed(2)} MB`;
        }

        this.actualizarElemento('metricPDF', totales.storage.porTipo.pdf.cantidad);
        this.actualizarElemento('metricPDFPorcentaje', totalArchivos > 0 ? `${((totales.storage.porTipo.pdf.cantidad / totalArchivos) * 100).toFixed(1)}%` : '0%');
        this.actualizarElemento('metricImagenes', totales.storage.porTipo.imagenes.cantidad);
        this.actualizarElemento('metricImagenesPorcentaje', totalArchivos > 0 ? `${((totales.storage.porTipo.imagenes.cantidad / totalArchivos) * 100).toFixed(1)}%` : '0%');
        this.actualizarElemento('metricDocumentosStorage', totales.storage.porTipo.documentos.cantidad);
        this.actualizarElemento('metricDocumentosPorcentaje', totalArchivos > 0 ? `${((totales.storage.porTipo.documentos.cantidad / totalArchivos) * 100).toFixed(1)}%` : '0%');
        this.actualizarElemento('metricMultimedia', totales.storage.porTipo.multimedia.cantidad);
        this.actualizarElemento('metricMultimediaPorcentaje', totalArchivos > 0 ? `${((totales.storage.porTipo.multimedia.cantidad / totalArchivos) * 100).toFixed(1)}%` : '0%');

        // Gráfica de tipos de archivo con totales filtrados
        const labels = ['PDF', 'Imágenes', 'Documentos', 'Multimedia', 'Otros'];
        const data = [
            totales.storage.porTipo.pdf.cantidad,
            totales.storage.porTipo.imagenes.cantidad,
            totales.storage.porTipo.documentos.cantidad,
            totales.storage.porTipo.multimedia.cantidad,
            totales.storage.porTipo.otros.cantidad
        ];
        this.crearGraficaPastel('graficoTiposArchivo', labels, data);

        // Actualizar tabla con las empresas filtradas
        this.actualizarTabla(empresas);

        // También actualizar las gráficas comparativas (pastel de almacenamiento y barras de documentos)
        this.actualizarGraficasComparativas(empresas);

        const modoVisualizacion = document.getElementById('modoVisualizacion');
        if (modoVisualizacion) {
            modoVisualizacion.innerHTML = `<i class="fas fa-chart-line"></i> <span>Todas las empresas</span>`;
        }
    }

    actualizarGraficasComparativas(empresas) {
        if (!empresas || empresas.length === 0) return;

        const nombresEmpresas = empresas.map(e => e.nombreEmpresa || e.organizacion || e.id);
        const almacenamiento = empresas.map(e => e.conteos.storage.totalSizeMB);
        const documentos = empresas.map(e => e.conteos.firestore.documentos);

        this.crearGraficaPastel('graficoAlmacenamientoPorEmpresa', nombresEmpresas, almacenamiento);
        this.crearGraficaBarras('graficoDocumentosPorEmpresa', nombresEmpresas, documentos, 'Documentos');
    }

    actualizarProgreso(progreso) {
        if (progreso.completado) {
            const progressContainer = document.getElementById('progressContainer');
            if (progressContainer) progressContainer.style.display = 'none';

            if (progreso.error) {
                this.mostrarError(progreso.mensaje);
            } else if (progreso.exitosas !== undefined) {
                this.mostrarExito(progreso.mensaje);
                this.recargarDatos();
            }
        } else {
            this.mostrarBarraProgreso(progreso);
        }
    }

    mostrarBarraProgreso(progreso) {
        let container = document.getElementById('progressContainer');
        if (!container) {
            container = document.createElement('div');
            container.id = 'progressContainer';
            document.body.appendChild(container);
        }

        const porcentaje = progreso.porcentaje || Math.round((progreso.procesadas / progreso.total) * 100);

        container.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
                <i class="fas fa-sync-alt fa-spin" style="color: var(--color-accent-primary);"></i>
                <strong style="color: var(--color-text-primary);">Actualizando estadísticas</strong>
            </div>
            <div style="margin-bottom: 5px;">
                <div style="background: var(--color-bg-tertiary); border-radius: 10px; overflow: hidden;">
                    <div style="width: ${porcentaje}%; background: var(--color-accent-primary); height: 6px; transition: width 0.3s;"></div>
                </div>
            </div>
            <div style="font-size: 0.75rem; color: var(--color-text-secondary);">
                ${progreso.mensaje || `Procesando: ${progreso.procesadas} de ${progreso.total} empresas (${porcentaje}%)`}
            </div>
            ${progreso.actual ? `
                <div style="font-size: 0.7rem; color: var(--color-text-muted); margin-top: 5px;">
                    <i class="fas fa-building"></i> Actual: ${progreso.actual}
                </div>
            ` : ''}
            ${progreso.error ? `
                <div style="font-size: 0.7rem; color: #ef4444; margin-top: 5px;">
                    <i class="fas fa-exclamation-triangle"></i> ${progreso.error}
                </div>
            ` : ''}
        `;

        container.style.display = 'block';
    }

    async recargarDatos() {
        try {
            this.datosTodasEmpresas = await OperacionesEstadisticas.obtenerDatosTodasEmpresas();
            this.actualizarTabla(this.datosTodasEmpresas.porEmpresa);
            this.actualizarGraficasComparativas(this.datosTodasEmpresas.porEmpresa);

            if (this.empresaSeleccionada === 'todas') {
                await this.mostrarVistaTodasEmpresas();
            } else {
                const empresaData = this.datosTodasEmpresas.porEmpresa.find(
                    e => e.id === this.empresaSeleccionada
                );
                if (empresaData) {
                    await this.mostrarDatosEmpresa(empresaData);
                }
            }

            const fechaElement = document.getElementById('fechaActualizacion');
            if (fechaElement && this.datosTodasEmpresas?.porEmpresa?.length > 0) {
                const fechas = this.datosTodasEmpresas.porEmpresa
                    .map(e => e.fechaActualizacion)
                    .filter(f => f instanceof Date && !isNaN(f));
                if (fechas.length > 0) {
                    const masReciente = new Date(Math.max(...fechas));
                    fechaElement.textContent = masReciente.toLocaleString();
                } else {
                    fechaElement.textContent = new Date().toLocaleString();
                }
            }
        } catch (error) {
            console.error('Error recargando datos:', error);
        }
    }

    bindEvents() {
        document.getElementById('btnAplicarFiltros')?.addEventListener('click', () => this.aplicarFiltros());
        document.getElementById('btnLimpiarFiltros')?.addEventListener('click', () => this.limpiarFiltros());
        document.getElementById('btnActualizar')?.addEventListener('click', () => this.actualizarDatos());
        document.getElementById('btnExportarExcel')?.addEventListener('click', () => this.exportarExcel());

        const tipoFiltro = document.getElementById('tipoFiltro');
        tipoFiltro?.addEventListener('change', (e) => this.toggleRangoFechas(e.target.value));
    }

    async cargarSelectores() {
        try {
            const selector = document.getElementById('selectorEmpresa');
            if (!selector) return;

            selector.innerHTML = '<option value="todas">Todas las empresas</option>';

            const organizaciones = await OperacionesEstadisticas.obtenerOrganizaciones();

            organizaciones.forEach(org => {
                const option = document.createElement('option');
                option.value = org.camelCase;
                option.textContent = `${org.nombre || org.camelCase}`;
                selector.appendChild(option);
            });

        } catch (error) {
            console.error('Error cargando selectores:', error);
        }
    }

    toggleRangoFechas(valor) {
        const rangoGrupo = document.getElementById('rangoFechasGrupo');
        if (rangoGrupo) {
            rangoGrupo.style.display = valor === 'personalizado' ? 'flex' : 'none';
        }

        if (valor !== 'personalizado') {
            this.filtroActual.periodo = valor;
        }
    }

    async aplicarFiltros() {
        const selector = document.getElementById('selectorEmpresa');
        const tipoFiltro = document.getElementById('tipoFiltro');

        const empresaId = selector?.value || 'todas';
        this.filtroActual.empresa = empresaId;
        this.filtroActual.periodo = tipoFiltro?.value || '';

        // 1. Calcular fechas reales según el período
        const ahora = new Date();
        let fechaInicio = null;
        let fechaFin = null;

        switch (this.filtroActual.periodo) {
            case 'semanal':
                fechaInicio = new Date(ahora.getTime() - 7 * 24 * 60 * 60 * 1000);
                fechaFin = ahora;
                break;
            case 'quincenal':
                fechaInicio = new Date(ahora.getTime() - 15 * 24 * 60 * 60 * 1000);
                fechaFin = ahora;
                break;
            case 'mensual':
                fechaInicio = new Date(ahora.getTime() - 30 * 24 * 60 * 60 * 1000);
                fechaFin = ahora;
                break;
            case 'personalizado':
                const fechaInicioInput = document.getElementById('fechaInicio')?.value;
                const fechaFinInput = document.getElementById('fechaFin')?.value;
                if (fechaInicioInput) fechaInicio = new Date(fechaInicioInput);
                if (fechaFinInput) fechaFin = new Date(fechaFinInput);
                break;
            default:
                // Sin período → sin filtro
                break;
        }

        this.filtroActual.fechaInicio = fechaInicio;
        this.filtroActual.fechaFin = fechaFin;

        // 2. Obtener todas las empresas disponibles
        const todasLasEmpresas = this.datosTodasEmpresas?.porEmpresa || [];

        // 3. Filtrar por fecha si hay rango definido
        let empresasFiltradas = todasLasEmpresas;
        if (fechaInicio && fechaFin) {
            empresasFiltradas = todasLasEmpresas.filter(emp => {
                const f = emp.fechaActualizacion;
                if (!f || !(f instanceof Date) || isNaN(f)) return false;
                return f >= fechaInicio && f <= fechaFin;
            });
        }

        // 4. Seleccionar empresa
        if (empresaId === 'todas') {
            this.empresaSeleccionada = 'todas';
            // Mostrar con las empresas filtradas (y recalcular totales)
            this.mostrarVistaTodasEmpresasConFiltro(empresasFiltradas);
        } else {
            this.empresaSeleccionada = empresaId;
            const empresaData = empresasFiltradas.find(e => e.id === empresaId);
            if (empresaData) {
                await this.mostrarDatosEmpresa(empresaData);
            } else {
                // Si no pasa el filtro o no existe, mostrar mensaje
                this.mostrarSinDatos();
                this.mostrarError('La organización no tiene datos en el período seleccionado.');
            }
        }
    }

    async mostrarDatosEmpresa(empresaData) {
        this.mostrarContenido();

        this.actualizarMetricasPorEmpresa(empresaData);
        this.actualizarGraficaTiposArchivo(empresaData);

        const modoVisualizacion = document.getElementById('modoVisualizacion');
        if (modoVisualizacion) {
            modoVisualizacion.innerHTML = `
                <i class="fas fa-building"></i> 
                <span>${empresaData.nombreEmpresa || empresaData.id}</span>
            `;
        }
    }

    actualizarMetricasPorEmpresa(empresaData) {
        const resumen = empresaData.getResumen();

        this.actualizarElemento('metricDocumentos', empresaData.conteos.firestore.documentos);
        this.actualizarElemento('metricAdministradores', empresaData.conteos.auth.administradores);
        this.actualizarElemento('metricColaboradores', empresaData.conteos.auth.colaboradores);
        this.actualizarElemento('metricTotalUsuarios', empresaData.conteos.auth.totalUsuarios);
        this.actualizarElemento('metricArchivosTotales', resumen.archivosTotales);

        const tamanioElement = document.getElementById('metricTamanioTotal');
        if (tamanioElement) {
            tamanioElement.textContent = `${resumen.tamanioTotalMB} MB`;
        }

        this.actualizarElemento('metricPDF', resumen.pdf.cantidad);
        this.actualizarElemento('metricPDFPorcentaje', `${resumen.pdf.porcentaje}%`);
        this.actualizarElemento('metricImagenes', resumen.imagenes.cantidad);
        this.actualizarElemento('metricImagenesPorcentaje', `${resumen.imagenes.porcentaje}%`);
        this.actualizarElemento('metricDocumentosStorage', resumen.documentos.cantidad);
        this.actualizarElemento('metricDocumentosPorcentaje', `${resumen.documentos.porcentaje}%`);
        this.actualizarElemento('metricMultimedia', resumen.multimedia.cantidad);
        this.actualizarElemento('metricMultimediaPorcentaje', `${resumen.multimedia.porcentaje}%`);
    }

    actualizarGraficaTiposArchivo(empresaData) {
        const resumen = empresaData.getResumen();

        const labels = ['PDF', 'Imágenes', 'Documentos', 'Multimedia', 'Otros'];
        const data = [
            resumen.pdf.cantidad,
            resumen.imagenes.cantidad,
            resumen.documentos.cantidad,
            resumen.multimedia.cantidad,
            resumen.otros.cantidad
        ];

        this.crearGraficaPastel('graficoTiposArchivo', labels, data);
    }

    crearGraficaPastel(canvasId, labels, data) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;

        if (this.charts[canvasId]) {
            this.charts[canvasId].destroy();
        }

        const total = data.reduce((a, b) => a + b, 0);

        const colores = [
            '#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6',
            '#ec489a', '#06b6d4', '#84cc16', '#f97316', '#6366f1'
        ];

        this.charts[canvasId] = new Chart(canvas.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: colores.slice(0, data.length),
                    borderWidth: 0,
                    hoverOffset: 10
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: '#ffffff',
                            font: { size: 10, family: "'Rajdhani', sans-serif" },
                            boxWidth: 12,
                            padding: 8
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const label = context.label || '';
                                const value = context.raw;
                                const porcentaje = total > 0 ? ((value / total) * 100).toFixed(1) : 0;

                                if (canvasId === 'graficoAlmacenamientoPorEmpresa') {
                                    return `${label}: ${value.toFixed(2)} MB (${porcentaje}%)`;
                                }
                                return `${label}: ${value.toLocaleString()} (${porcentaje}%)`;
                            }
                        }
                    }
                },
                cutout: '50%',
                radius: '70%'
            }
        });
    }

    crearGraficaBarras(canvasId, labels, data, labelY) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;

        if (this.charts[canvasId]) {
            this.charts[canvasId].destroy();
        }

        this.charts[canvasId] = new Chart(canvas.getContext('2d'), {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: labelY,
                    data: data,
                    backgroundColor: '#3b82f6',
                    borderRadius: 6,
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: {
                            color: '#ffffff',
                            font: { size: 11, family: "'Rajdhani', sans-serif" }
                        },
                        position: 'top'
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                return `${labelY}: ${context.raw.toLocaleString()}`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(255,255,255,0.1)', drawBorder: false },
                        ticks: {
                            color: '#ffffff',
                            stepSize: Math.ceil(Math.max(...data, 1) / 5),
                            callback: (value) => value.toLocaleString()
                        },
                        title: {
                            display: true,
                            text: labelY,
                            color: '#9ca3af',
                            font: { size: 10, family: "'Rajdhani', sans-serif" }
                        }
                    },
                    x: {
                        grid: { display: false },
                        ticks: {
                            color: '#ffffff',
                            maxRotation: 45,
                            minRotation: 45,
                            font: { size: 9, family: "'Rajdhani', sans-serif" }
                        },
                        title: {
                            display: true,
                            text: 'Organización',
                            color: '#9ca3af',
                            font: { size: 10, family: "'Rajdhani', sans-serif" }
                        }
                    }
                }
            }
        });
    }

    limpiarFiltros() {
        const selector = document.getElementById('selectorEmpresa');
        const tipoFiltro = document.getElementById('tipoFiltro');
        const fechaInicio = document.getElementById('fechaInicio');
        const fechaFin = document.getElementById('fechaFin');

        if (selector) selector.value = 'todas';
        if (tipoFiltro) tipoFiltro.value = '';
        if (fechaInicio) fechaInicio.value = '';
        if (fechaFin) fechaFin.value = '';

        const rangoGrupo = document.getElementById('rangoFechasGrupo');
        if (rangoGrupo) rangoGrupo.style.display = 'none';

        this.filtroActual = {
            empresa: 'todas',
            periodo: '',
            fechaInicio: null,
            fechaFin: null
        };

        this.empresaSeleccionada = 'todas';

        // Volver a mostrar todas las empresas (sin filtro)
        const todas = this.datosTodasEmpresas?.porEmpresa || [];
        this.mostrarVistaTodasEmpresasConFiltro(todas);

        const modoVisualizacion = document.getElementById('modoVisualizacion');
        if (modoVisualizacion) {
            modoVisualizacion.innerHTML = `<i class="fas fa-chart-line"></i> <span>Todas las empresas</span>`;
        }
    }

    async actualizarDatos() {
        await OperacionesEstadisticas.actualizarTodas({
            pausaEntreLotes: 800,
            loteSize: 2,
            skipCache: true
        });
    }

    actualizarElemento(id, valor) {
        const elemento = document.getElementById(id);
        if (elemento) {
            elemento.textContent = typeof valor === 'number' ? valor.toLocaleString() : valor;
        }
    }

    actualizarTabla(empresas) {
        const tbody = document.getElementById('tablaOrganizacionesBody');
        if (!tbody) return;

        if (!empresas || empresas.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:40px;"><i class="fas fa-building" style="font-size:32px; opacity:0.3; margin-bottom:10px;"></i><br>No hay datos de organizaciones disponibles</td></tr>';
            return;
        }

        const totalDocs = empresas.reduce((sum, e) => sum + e.conteos.firestore.documentos, 0);
        const totalArchivos = empresas.reduce((sum, e) => sum + e.getResumen().archivosTotales, 0);

        tbody.innerHTML = empresas.map(emp => {
            const resumen = emp.getResumen();
            const porcentajeDocs = totalDocs > 0 ? Math.round((resumen.totalDocumentos / totalDocs) * 100) : 0;
            const porcentajeArchivos = totalArchivos > 0 ? Math.round((resumen.archivosTotales / totalArchivos) * 100) : 0;

            return `
            <tr>
                <td><strong><i class="fas fa-building" style="color: #3b82f6; margin-right: 8px;"></i>${this.escapeHTML(emp.nombreEmpresa || emp.organizacion || emp.id)}</strong></td>
                <td><span class="badge-value badge-info">${resumen.totalDocumentos.toLocaleString()}</span><span class="porcentaje-badge">${porcentajeDocs}%</span></td>
                <td><span class="badge-value badge-warning">${resumen.archivosTotales.toLocaleString()}</span><span class="porcentaje-badge">${porcentajeArchivos}%</span></td>
                <td><span class="badge-value badge-success">${resumen.tamanioTotalMB} MB</span></td>
                <td><span class="badge-value badge-secondary">${emp.conteos.auth.administradores.toLocaleString()}</span></td>
                <td><span class="badge-value badge-secondary">${emp.conteos.auth.colaboradores.toLocaleString()}</span></td>
                <td><span class="badge-value badge-primary">${emp.conteos.auth.totalUsuarios.toLocaleString()}</span></td>
            </tr>
        `;
        }).join('');
    }

    escapeHTML(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    async exportarExcel() {
        if (!this.datosTodasEmpresas || !this.datosTodasEmpresas.porEmpresa) {
            this.mostrarError('No hay datos para exportar');
            return;
        }

        try {
            const datosCSV = OperacionesEstadisticas.exportarACSV(this.datosTodasEmpresas.porEmpresa);
            if (!datosCSV) return;

            const csvContent = datosCSV.map(row => row.join(',')).join('\n');
            const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.href = url;
            link.setAttribute('download', `estadisticas_${new Date().toISOString().slice(0, 19)}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            this.mostrarExito('Exportación completada');
        } catch (error) {
            console.error('Error exportando:', error);
            this.mostrarError('Error al exportar datos');
        }
    }

    async mostrarDiagnostico() {
        const organizaciones = await OperacionesEstadisticas.obtenerOrganizaciones();

        const totales = this.datosTodasEmpresas?.totales || {
            firestore: { documentos: 0 },
            storage: { totalArchivos: 0, totalSizeMB: 0 },
            auth: { totalUsuarios: 0 }
        };

        const mensaje = `
            📊 DIAGNÓSTICO DE ESTADÍSTICAS
            ─────────────────────────────────
            📁 Organizaciones encontradas: ${organizaciones.length}
            📄 Documentos totales: ${totales.firestore.documentos}
            💾 Archivos storage: ${totales.storage.totalArchivos}
            📦 Tamaño total: ${totales.storage.totalSizeMB?.toFixed(2) || 0} MB
            👥 Usuarios totales: ${totales.auth.totalUsuarios}
            
            🏢 Empresas con datos:
            ${organizaciones.map(org => `  - ${org.nombre}: ${org.camelCase}`).join('\n')}
            
            🔄 Última actualización: ${new Date().toLocaleString()}
            📊 Caché activa: ${OperacionesEstadisticas.cache?.size || 0} organizaciones
            💾 Caché storage: ${OperacionesEstadisticas.storageCache?.size || 0} entradas
            🏢 Vista actual: ${this.empresaSeleccionada === 'todas' ? 'Todas las empresas' : this.empresaSeleccionada}
        `;

        Swal.fire({
            title: 'Diagnóstico del Sistema',
            html: `<pre style="text-align:left; background:#1a1a2e; padding:15px; border-radius:8px; overflow-x:auto;">${mensaje}</pre>`,
            icon: 'info',
            confirmButtonText: 'Entendido',
            background: '#1e1e2e',
            color: '#ffffff'
        });
    }

    mostrarContenido() {
        const contenido = document.getElementById('contenidoPrincipal');
        const sinDatos = document.getElementById('sinDatosMensaje');
        const seccionMetricas = document.getElementById('seccionMetricas');
        const seccionStorage = document.getElementById('seccionStorage');
        const seccionGraficas = document.getElementById('seccionGraficas');
        const seccionTabla = document.getElementById('seccionTabla');

        if (contenido) contenido.style.display = 'block';
        if (sinDatos) sinDatos.style.display = 'none';
        if (seccionMetricas) seccionMetricas.style.display = 'block';
        if (seccionStorage) seccionStorage.style.display = 'block';
        if (seccionGraficas) seccionGraficas.style.display = 'block';
        if (seccionTabla) seccionTabla.style.display = 'block';
    }

    mostrarSinDatos() {
        const contenido = document.getElementById('contenidoPrincipal');
        const sinDatos = document.getElementById('sinDatosMensaje');
        const sinDatosTexto = document.getElementById('sinDatosTexto');

        if (contenido) contenido.style.display = 'none';
        if (sinDatos) sinDatos.style.display = 'flex';
        if (sinDatosTexto) {
            sinDatosTexto.textContent = 'No hay datos disponibles';
        }

        const metricas = ['metricDocumentos', 'metricAdministradores', 'metricColaboradores', 'metricTotalUsuarios',
            'metricArchivosTotales', 'metricTamanioTotal', 'metricPDF', 'metricPDFPorcentaje',
            'metricImagenes', 'metricImagenesPorcentaje', 'metricDocumentosStorage',
            'metricDocumentosPorcentaje', 'metricMultimedia', 'metricMultimediaPorcentaje'];
        metricas.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = id.includes('Porcentaje') ? '0%' : '0';
        });

        const graficas = ['graficoTiposArchivo', 'graficoAlmacenamientoPorEmpresa', 'graficoDocumentosPorEmpresa'];
        graficas.forEach(id => {
            const canvas = document.getElementById(id);
            if (canvas) {
                const ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.font = '14px Arial';
                ctx.fillStyle = 'rgba(255,255,255,0.5)';
                ctx.textAlign = 'center';
                ctx.fillText('📭 No hay datos disponibles', canvas.width / 2, canvas.height / 2);
            }
        });
    }

    mostrarError(mensaje) {
        Swal.fire({
            title: 'Error',
            text: mensaje,
            icon: 'error',
            confirmButtonText: 'OK',
            background: '#1e1e2e',
            color: '#ffffff'
        });
    }

    mostrarExito(mensaje) {
        Swal.fire({
            title: 'Éxito',
            text: mensaje,
            icon: 'success',
            timer: 2000,
            showConfirmButton: false,
            background: '#1e1e2e',
            color: '#ffffff'
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new OperacionesController();
});