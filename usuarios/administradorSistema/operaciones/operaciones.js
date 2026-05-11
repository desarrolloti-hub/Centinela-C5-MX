// operaciones.js - VERSIÓN COMPLETA CON FILTRO POR SNAPSHOTS

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

        const labels = ['PDF', 'Imágenes'];
        const data = [
            totales.storage.porTipo.pdf.cantidad,
            totales.storage.porTipo.imagenes.cantidad
        ];
        this.crearGraficaPastel('graficoTiposArchivo', labels, data);

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

        const ahora = new Date();
        let fechaInicio = null;
        let fechaFin = null;

        switch (this.filtroActual.periodo) {
            case '7d':
                fechaInicio = new Date(ahora.getTime() - 7 * 24 * 60 * 60 * 1000);
                fechaFin = ahora;
                break;
            case '14d':
                fechaInicio = new Date(ahora.getTime() - 14 * 24 * 60 * 60 * 1000);
                fechaFin = ahora;
                break;
            case '21d':
                fechaInicio = new Date(ahora.getTime() - 21 * 24 * 60 * 60 * 1000);
                fechaFin = ahora;
                break;
            case '28d':
                fechaInicio = new Date(ahora.getTime() - 28 * 24 * 60 * 60 * 1000);
                fechaFin = ahora;
                break;
            case 'personalizado':
                const fechaInicioInput = document.getElementById('fechaInicio')?.value;
                const fechaFinInput = document.getElementById('fechaFin')?.value;
                if (fechaInicioInput) fechaInicio = new Date(fechaInicioInput);
                if (fechaFinInput) {
                    fechaFin = new Date(fechaFinInput);
                    fechaFin.setHours(23, 59, 59, 999);
                }
                break;
            default:
                break;
        }

        this.filtroActual.fechaInicio = fechaInicio;
        this.filtroActual.fechaFin = fechaFin;

        // Si no hay período, mostrar estado actual (todas las empresas)
        if (!fechaInicio || !fechaFin) {
            const todas = this.datosTodasEmpresas?.porEmpresa || [];
            if (empresaId === 'todas') {
                this.empresaSeleccionada = 'todas';
                this.mostrarVistaTodasEmpresasConFiltro(todas);
            } else {
                this.empresaSeleccionada = empresaId;
                const empresaData = todas.find(e => e.id === empresaId);
                if (empresaData) {
                    await this.mostrarDatosEmpresa(empresaData);
                } else {
                    this.mostrarSinDatos();
                    this.mostrarError('Organización no encontrada');
                }
            }
            return;
        }

        // --- FILTRO POR PERÍODO USANDO SNAPSHOTS ---
        if (empresaId === 'todas') {
            const totalesDelta = {
                firestore: { documentos: 0 },
                storage: { totalArchivos: 0, totalSizeMB: 0, porTipo: { pdf: { cantidad: 0 }, imagenes: { cantidad: 0 } } },
                auth: { totalUsuarios: 0, administradores: 0, colaboradores: 0 }
            };
            const orgsConDatos = [];

            for (const emp of (this.datosTodasEmpresas?.porEmpresa || [])) {
                const snapshots = await OperacionesEstadisticas.obtenerSnapshots(emp.id);
                const delta = this._calcularDelta(snapshots, fechaInicio, fechaFin);
                if (delta) {
                    orgsConDatos.push({ ...delta, id: emp.id, nombre: emp.nombreEmpresa || emp.organizacion || emp.id });
                    totalesDelta.firestore.documentos += delta.firestore.documentos;
                    totalesDelta.storage.totalArchivos += delta.storage.totalArchivos;
                    totalesDelta.storage.totalSizeMB += delta.storage.totalSizeMB;
                    totalesDelta.storage.porTipo.pdf.cantidad += delta.storage.porTipo.pdf.cantidad;
                    totalesDelta.storage.porTipo.imagenes.cantidad += delta.storage.porTipo.imagenes.cantidad;
                    totalesDelta.auth.totalUsuarios += delta.auth.totalUsuarios;
                    totalesDelta.auth.administradores += delta.auth.administradores;
                    totalesDelta.auth.colaboradores += delta.auth.colaboradores;
                }
            }

            this.empresaSeleccionada = 'todas';
            if (orgsConDatos.length > 0) {
                this._mostrarConsolidadoDelta(totalesDelta, orgsConDatos);
            } else {
                this.mostrarSinDatos();
                this.mostrarError('No hay datos en el período seleccionado');
            }
        } else {
            const snapshots = await OperacionesEstadisticas.obtenerSnapshots(empresaId);
            const delta = this._calcularDelta(snapshots, fechaInicio, fechaFin);
            if (delta) {
                this.empresaSeleccionada = empresaId;
                this._mostrarDeltaEmpresa(delta, empresaId);
            } else {
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
    }

    actualizarGraficaTiposArchivo(empresaData) {
        const resumen = empresaData.getResumen();

        const labels = ['PDF', 'Imágenes'];
        const data = [
            resumen.pdf.cantidad,
            resumen.imagenes.cantidad
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

        this.filtroActual = { empresa: 'todas', periodo: '', fechaInicio: null, fechaFin: null };
        this.empresaSeleccionada = 'todas';

        const todas = this.datosTodasEmpresas?.porEmpresa || [];
        if (todas.length > 0) {
            this.mostrarVistaTodasEmpresasConFiltro(todas);
        } else {
            this.mostrarVistaTodasEmpresas();
        }

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

        const totalDocs = empresas.reduce((sum, e) => sum + (e.conteos?.firestore?.documentos || 0), 0);
        const totalArchivos = empresas.reduce((sum, e) => sum + (e.conteos?.storage?.totalArchivos || 0), 0);

        tbody.innerHTML = empresas.map(emp => {
            const documentos = emp.conteos?.firestore?.documentos || 0;
            const archivos = emp.conteos?.storage?.totalArchivos || 0;
            const tamanio = emp.conteos?.storage?.totalSizeMB || 0;
            const admins = emp.conteos?.auth?.administradores || 0;
            const colabs = emp.conteos?.auth?.colaboradores || 0;
            const totalUsu = (emp.conteos?.auth?.totalUsuarios) || (admins + colabs) || 0;
            const nombre = emp.nombre || emp.id || '';
            const porcentajeDocs = totalDocs > 0 ? Math.round((documentos / totalDocs) * 100) : 0;
            const porcentajeArchivos = totalArchivos > 0 ? Math.round((archivos / totalArchivos) * 100) : 0;

            return `
                <tr>
                    <td><strong><i class="fas fa-building" style="color: #3b82f6; margin-right: 8px;"></i>${this.escapeHTML(nombre)}</strong></td>
                    <td><span class="badge-value badge-info">${documentos.toLocaleString()}</span><span class="porcentaje-badge">${porcentajeDocs}%</span></td>
                    <td><span class="badge-value badge-warning">${archivos.toLocaleString()}</span><span class="porcentaje-badge">${porcentajeArchivos}%</span></td>
                    <td><span class="badge-value badge-success">${tamanio.toFixed(2)} MB</span></td>
                    <td><span class="badge-value badge-secondary">${admins.toLocaleString()}</span></td>
                    <td><span class="badge-value badge-secondary">${colabs.toLocaleString()}</span></td>
                    <td><span class="badge-value badge-primary">${totalUsu.toLocaleString()}</span></td>
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
            'metricImagenes', 'metricImagenesPorcentaje'];
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

    // ==================== MÉTODOS PARA FILTRO POR SNAPSHOT ====================

    _calcularDelta(snapshots, fechaInicio, fechaFin) {
        if (!snapshots || snapshots.length === 0) return null;

        const antesOEnPeriodo = snapshots.filter(s => s.fechaActualizacion <= fechaFin);
        if (antesOEnPeriodo.length === 0) return null;

        const snapshotFin = antesOEnPeriodo[antesOEnPeriodo.length - 1];

        let snapshotInicio = null;
        for (let i = antesOEnPeriodo.length - 1; i >= 0; i--) {
            if (antesOEnPeriodo[i].fechaActualizacion <= fechaInicio) {
                snapshotInicio = antesOEnPeriodo[i];
                break;
            }
        }
        if (!snapshotInicio) snapshotInicio = antesOEnPeriodo[0];
        if (!snapshotInicio || snapshotInicio === snapshotFin) return null;

        const diff = {
            firestore: {
                documentos: snapshotFin.conteos.firestore.documentos - snapshotInicio.conteos.firestore.documentos
            },
            storage: {
                totalArchivos: snapshotFin.conteos.storage.totalArchivos - snapshotInicio.conteos.storage.totalArchivos,
                totalSizeMB: +(snapshotFin.conteos.storage.totalSizeMB - snapshotInicio.conteos.storage.totalSizeMB).toFixed(2),
                porTipo: {
                    pdf: {
                        cantidad: snapshotFin.conteos.storage.porTipo.pdf.cantidad - snapshotInicio.conteos.storage.porTipo.pdf.cantidad
                    },
                    imagenes: {
                        cantidad: snapshotFin.conteos.storage.porTipo.imagenes.cantidad - snapshotInicio.conteos.storage.porTipo.imagenes.cantidad
                    }
                }
            },
            auth: {
                totalUsuarios: snapshotFin.conteos.auth.totalUsuarios - snapshotInicio.conteos.auth.totalUsuarios,
                administradores: snapshotFin.conteos.auth.administradores - snapshotInicio.conteos.auth.administradores,
                colaboradores: snapshotFin.conteos.auth.colaboradores - snapshotInicio.conteos.auth.colaboradores
            }
        };
        return diff;
    }

    _mostrarConsolidadoDelta(totalesDelta, orgsConDatos) {
        this.mostrarContenido();

        this.actualizarElemento('metricDocumentos', totalesDelta.firestore.documentos);
        this.actualizarElemento('metricAdministradores', totalesDelta.auth.administradores);
        this.actualizarElemento('metricColaboradores', totalesDelta.auth.colaboradores);
        this.actualizarElemento('metricTotalUsuarios', totalesDelta.auth.totalUsuarios);
        this.actualizarElemento('metricArchivosTotales', totalesDelta.storage.totalArchivos);
        const tamEl = document.getElementById('metricTamanioTotal');
        if (tamEl) tamEl.textContent = `${totalesDelta.storage.totalSizeMB.toFixed(2)} MB`;

        const totalArchivos = totalesDelta.storage.totalArchivos;
        this.actualizarElemento('metricPDF', totalesDelta.storage.porTipo.pdf.cantidad);
        this.actualizarElemento('metricPDFPorcentaje', totalArchivos > 0 ? `${((totalesDelta.storage.porTipo.pdf.cantidad / totalArchivos) * 100).toFixed(1)}%` : '0%');
        this.actualizarElemento('metricImagenes', totalesDelta.storage.porTipo.imagenes.cantidad);
        this.actualizarElemento('metricImagenesPorcentaje', totalArchivos > 0 ? `${((totalesDelta.storage.porTipo.imagenes.cantidad / totalArchivos) * 100).toFixed(1)}%` : '0%');

        const labels = ['PDF', 'Imágenes'];
        const data = [
            totalesDelta.storage.porTipo.pdf.cantidad,
            totalesDelta.storage.porTipo.imagenes.cantidad
        ];
        this.crearGraficaPastel('graficoTiposArchivo', labels, data);

        const nombres = orgsConDatos.map(o => o.nombre);
        const almacenamientos = orgsConDatos.map(o => o.storage.totalSizeMB);
        const docs = orgsConDatos.map(o => o.firestore.documentos);
        this.crearGraficaPastel('graficoAlmacenamientoPorEmpresa', nombres, almacenamientos);
        this.crearGraficaBarras('graficoDocumentosPorEmpresa', nombres, docs, 'Documentos');

        this.actualizarTabla(orgsConDatos.map(o => ({
            id: o.id,
            nombre: o.nombre,
            conteos: {
                firestore: { documentos: o.firestore.documentos },
                storage: { totalArchivos: o.storage.totalArchivos, totalSizeMB: o.storage.totalSizeMB },
                auth: o.auth
            }
        })));

        const modo = document.getElementById('modoVisualizacion');
        if (modo) modo.innerHTML = `<i class="fas fa-chart-line"></i> <span>Todas las empresas (consumo)</span>`;
    }

    _mostrarDeltaEmpresa(delta, empresaId) {
        this.mostrarContenido();

        this.actualizarElemento('metricDocumentos', delta.firestore.documentos);
        this.actualizarElemento('metricAdministradores', delta.auth.administradores);
        this.actualizarElemento('metricColaboradores', delta.auth.colaboradores);
        this.actualizarElemento('metricTotalUsuarios', delta.auth.totalUsuarios);
        this.actualizarElemento('metricArchivosTotales', delta.storage.totalArchivos);
        const tamEl = document.getElementById('metricTamanioTotal');
        if (tamEl) tamEl.textContent = `${delta.storage.totalSizeMB.toFixed(2)} MB`;

        const totalArchivos = delta.storage.totalArchivos;
        this.actualizarElemento('metricPDF', delta.storage.porTipo.pdf.cantidad);
        this.actualizarElemento('metricPDFPorcentaje', totalArchivos > 0 ? `${((delta.storage.porTipo.pdf.cantidad / totalArchivos) * 100).toFixed(1)}%` : '0%');
        this.actualizarElemento('metricImagenes', delta.storage.porTipo.imagenes.cantidad);
        this.actualizarElemento('metricImagenesPorcentaje', totalArchivos > 0 ? `${((delta.storage.porTipo.imagenes.cantidad / totalArchivos) * 100).toFixed(1)}%` : '0%');

        this.crearGraficaPastel('graficoTiposArchivo', ['PDF', 'Imágenes'], [
            delta.storage.porTipo.pdf.cantidad,
            delta.storage.porTipo.imagenes.cantidad
        ]);
        this.crearGraficaPastel('graficoAlmacenamientoPorEmpresa', [empresaId], [delta.storage.totalSizeMB]);
        this.crearGraficaBarras('graficoDocumentosPorEmpresa', [empresaId], [delta.firestore.documentos], 'Documentos');

        const modo = document.getElementById('modoVisualizacion');
        if (modo) modo.innerHTML = `<i class="fas fa-building"></i> <span>${empresaId} (consumo)</span>`;
    }

    mostrarVistaTodasEmpresasConFiltro(empresas) {
        // Este método se usa para la vista sin filtro (estado actual)
        if (!empresas || empresas.length === 0) {
            this.mostrarSinDatos();
            return;
        }
        this.mostrarContenido();
        // Reutilizamos la lógica de mostrarVistaTodasEmpresas pero con la lista dada
        // Calculamos totales rápidamente
        const totalDocs = empresas.reduce((s, e) => s + (e.conteos?.firestore?.documentos || 0), 0);
        const totalArchivos = empresas.reduce((s, e) => s + (e.conteos?.storage?.totalArchivos || 0), 0);
        const totalSizeMB = empresas.reduce((s, e) => s + (e.conteos?.storage?.totalSizeMB || 0), 0);
        const admins = empresas.reduce((s, e) => s + (e.conteos?.auth?.administradores || 0), 0);
        const colabs = empresas.reduce((s, e) => s + (e.conteos?.auth?.colaboradores || 0), 0);
        const totalUsuarios = empresas.reduce((s, e) => s + (e.conteos?.auth?.totalUsuarios || 0), 0);

        this.actualizarElemento('metricDocumentos', totalDocs);
        this.actualizarElemento('metricAdministradores', admins);
        this.actualizarElemento('metricColaboradores', colabs);
        this.actualizarElemento('metricTotalUsuarios', totalUsuarios);
        this.actualizarElemento('metricArchivosTotales', totalArchivos);
        const tamEl = document.getElementById('metricTamanioTotal');
        if (tamEl) tamEl.textContent = `${totalSizeMB.toFixed(2)} MB`;

        const pdfCant = empresas.reduce((s, e) => s + (e.conteos?.storage?.porTipo?.pdf?.cantidad || 0), 0);
        const imgCant = empresas.reduce((s, e) => s + (e.conteos?.storage?.porTipo?.imagenes?.cantidad || 0), 0);
        this.actualizarElemento('metricPDF', pdfCant);
        this.actualizarElemento('metricPDFPorcentaje', totalArchivos > 0 ? `${((pdfCant / totalArchivos) * 100).toFixed(1)}%` : '0%');
        this.actualizarElemento('metricImagenes', imgCant);
        this.actualizarElemento('metricImagenesPorcentaje', totalArchivos > 0 ? `${((imgCant / totalArchivos) * 100).toFixed(1)}%` : '0%');

        this.crearGraficaPastel('graficoTiposArchivo', ['PDF', 'Imágenes'], [pdfCant, imgCant]);
        this.actualizarGraficasComparativas(empresas);
        this.actualizarTabla(empresas);

        const modo = document.getElementById('modoVisualizacion');
        if (modo) modo.innerHTML = `<i class="fas fa-chart-line"></i> <span>Todas las empresas</span>`;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new OperacionesController();
});