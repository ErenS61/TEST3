let map;
let currentMarkers = [];
let currentDepartment = localStorage.getItem("selectedDepartment") || "";

// Fonction de rafraîchissement de la page
function refreshPage() {
    location.reload();
}

// Initialisation de l'application
function initApp() {
    console.log("Initialisation de l'application");

    // Créer le sélecteur de département
    createDepartmentSelector();

    // Initialiser la carte
    initMap();

    // Charger le département sauvegardé si existant
    if (currentDepartment) {
        const select = document.getElementById("departmentSelector");
        select.value = currentDepartment;
        select.classList.remove("default-selection");
        loadStationsForDepartment(currentDepartment);
    }

    console.log("Application initialisée");
}

// Création du sélecteur de département
function createDepartmentSelector() {
    const container = document.getElementById("departmentSelectorContainer");
    const select = document.getElementById("departmentSelector");

    if (!container || !select) {
        console.error("Conteneur ou sélecteur de département non trouvé");
        return;
    }

    // Remplir le sélecteur avec les départements
    departements.forEach((dept) => {
        const option = document.createElement("option");
        option.value = dept.code;
        option.textContent = `${dept.code} - ${dept.nom}`;
        select.appendChild(option);
    });

    // Restaurer la sélection précédente si elle existe
    if (currentDepartment) {
        select.value = currentDepartment;
        select.classList.remove("default-selection");
    }

    // Gestion du changement de département
    select.addEventListener("change", function () {
        const codeDepartement = this.value;

        if (codeDepartement) {
            localStorage.setItem("selectedDepartment", codeDepartement);
            currentDepartment = codeDepartement;
            loadStationsForDepartment(codeDepartement);
            this.classList.remove("default-selection");
        } else {
            localStorage.removeItem("selectedDepartment");
            currentDepartment = "";
            this.classList.add("default-selection");
            clearStations();
            updateStationsCount(0);
        }
    });

    // Ajouter la classe pour le clignotement si valeur par défaut
    if (!currentDepartment) {
        select.classList.add("default-selection");
    }
}

// Initialisation de la carte Leaflet
function initMap() {
    // Centrer sur la France
    map = L.map("map").setView([46.603354, 1.888334], 6);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    // Ajouter le contrôle de localisation
    const locateControl = L.control({ position: "topleft" });
    locateControl.onAdd = function (map) {
        const div = L.DomUtil.create("div", "leaflet-bar leaflet-control leaflet-locate-control");
        div.innerHTML = `
            <a href="#" title="Se localiser" class="locate-button">
                <i class="fa-solid fa-location-crosshairs"></i>
            </a>
        `;
        div.onclick = function (e) {
            L.DomEvent.stopPropagation(e);
            L.DomEvent.preventDefault(e);
            locateUser();
        };
        return div;
    };
    locateControl.addTo(map);
}

// Localisation de l'utilisateur
function locateUser() {
    if (navigator.geolocation) {
        const locateButton = document.querySelector(".leaflet-locate-control .locate-button");
        if (locateButton) {
            locateButton.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
            locateButton.style.opacity = "0.8";
        }

        navigator.geolocation.getCurrentPosition(
            function (pos) {
                const lat = pos.coords.latitude;
                const lon = pos.coords.longitude;
                map.flyTo([lat, lon], 13, { duration: 1, easeLinearity: 0.25 });

                if (window.userLocationMarker) {
                    map.removeLayer(window.userLocationMarker);
                }

                window.userLocationMarker = L.circleMarker([lat, lon], {
                    radius: 8,
                    fillColor: "#3388ff",
                    color: "#fff",
                    weight: 2,
                    opacity: 1,
                    fillOpacity: 0.9
                })
                    .addTo(map)
                    .bindPopup("<b>📍 Vous êtes ici</b>", { className: "user-location-popup" });

                setTimeout(() => {
                    if (locateButton) {
                        locateButton.innerHTML = '<i class="fa-solid fa-location-crosshairs"></i>';
                        locateButton.style.opacity = "1";
                    }
                    window.userLocationMarker.openPopup();
                }, 1000);
            },
            function (err) {
                console.warn("Géolocalisation refusée :", err.message);
                showSystemMessage("Géolocalisation refusée", true);
                const locateButton = document.querySelector(".leaflet-locate-control .locate-button");
                if (locateButton) {
                    locateButton.innerHTML = '<i class="fa-solid fa-location-crosshairs"></i>';
                    locateButton.style.opacity = "1";
                }
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
        );
    } else {
        showSystemMessage("Géolocalisation non supportée", true);
    }
}

// Chargement des stations pour un département
function loadStationsForDepartment(codeDepartement) {
    const baseUrl =
        "https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2/records";
    const params = new URLSearchParams({
        select: "id,adresse,cp,ville,departement,code_departement,geom",
        limit: "100",
        refine: `code_departement:${codeDepartement}`,
        lang: "fr",
        timezone: "Europe/Paris"
    });

    const url = `${baseUrl}?${params.toString()}`;

    // Afficher un indicateur de chargement
    showSystemMessage("Chargement des stations...");

    fetch(url, { cache: "no-store" })
        .then((res) => res.json())
        .then((data) => {
            // Mettre à jour le compteur de stations avec le total_count
            updateStationsCount(data.total_count);

            // Afficher les stations sur la carte
            displayStationsOnMap(data.results, codeDepartement);

            // Afficher le message avec le nombre total de stations
            const dept = departements.find((d) => d.code === codeDepartement);
            const deptName = dept ? dept.nom : `Département ${codeDepartement}`;
            showSystemMessage(`${data.total_count} station(s) disponible(s)`);
        })
        .catch((err) => {
            console.error("Erreur lors du chargement des stations :", err);
            showSystemMessage("Erreur lors du chargement des stations", true);
        });
}

// Affichage des stations sur la carte
function displayStationsOnMap(stations, codeDepartement) {
    // Supprimer les marqueurs existants
    clearStations();

    if (stations.length === 0) {
        showSystemMessage("Aucune station trouvée pour ce département", true);
        return;
    }

    // Trouver le département sélectionné
    const dept = departements.find((d) => d.code === codeDepartement);
    const deptName = dept ? dept.nom : `Département ${codeDepartement}`;

    // Ajuster la vue de la carte pour montrer toutes les stations
    const bounds = L.latLngBounds([]);

    stations.forEach((station) => {
        if (station.geom && station.geom.lon && station.geom.lat) {
            const lon = station.geom.lon;
            const lat = station.geom.lat;

            // Créer l'icône personnalisée
            const customIcon = L.divIcon({
                className: "custom-map-marker",
                html: `<div style="background-color:#00ffcc; width:24px; height:24px; border-radius:50%; border:2px solid white; display:flex; align-items:center; justify-content:center; box-shadow:0 0 10px rgba(0,0,0,0.5)">
                         <i class="fa-solid fa-gas-pump" style="color:#1a1a1a; font-size:12px"></i>
                       </div>`,
                iconSize: [24, 24],
                iconAnchor: [12, 12]
            });

            // Créer le contenu du popup
            const popupContent = `
                <div class="popup-container">
                    <div class="popup-header">
                        <b>${station.id || "N/A"}</b>
                    </div>
                    <div class="popup-info">
                        <div class="info-line"><strong>Adresse :</strong> ${station.adresse || "N/A"}</div>
                        <div class="info-line"><strong>Ville :</strong> ${station.ville || "N/A"} (${station.cp || "N/A"})</div>
                        <div class="info-line"><strong>Département :</strong> ${station.departement || "N/A"}</div>
                        <div class="info-line"><strong>Code Dépt :</strong> ${station.code_departement || "N/A"}</div>
                    </div>
                </div>
            `;

            // Créer le marqueur
            const marker = L.marker([lat, lon], {
                title: station.id,
                icon: customIcon
            })
                .addTo(map)
                .bindPopup(popupContent);

            currentMarkers.push(marker);
            bounds.extend([lat, lon]);
        }
    });

    // Ajuster la vue de la carte pour montrer toutes les stations
    if (currentMarkers.length > 0) {
        map.fitBounds(bounds, { padding: [20, 20] });
    }
}

// Supprimer tous les marqueurs de la carte
function clearStations() {
    currentMarkers.forEach((marker) => {
        map.removeLayer(marker);
    });
    currentMarkers = [];
}

// Mettre à jour le compteur de stations
function updateStationsCount(count) {
    const countElement = document.getElementById("stationsCount");
    if (countElement) {
        countElement.textContent = `${count} station(s) disponible(s)`;
    }
}

// Afficher un message système
function showSystemMessage(message, isError = false) {
    // Supprimer tout message existant
    const existingMsg = document.querySelector(".system-message");
    if (existingMsg) {
        existingMsg.remove();
    }

    const msg = document.createElement("div");
    msg.className = "system-message";
    msg.textContent = message;
    if (isError) {
        msg.classList.add("error-message");
    }
    document.body.appendChild(msg);
    setTimeout(() => {
        msg.style.opacity = "0";
        setTimeout(() => msg.remove(), 500);
    }, 3000);
}

// Démarrer l'application lorsque le DOM est chargé
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initApp);
} else {
    initApp();
}
