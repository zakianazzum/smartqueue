// SmartQueue - customer page

var serviceId = null;
var serviceName = "";
var locationId = null;
var locationName = "";
var myTokenId = null;
var timer = null;


window.onload = function () {
    startClock();
    loadServices();

    // if the customer already has a token, go straight back to tracking
    var saved = localStorage.getItem("my_token_id");
    if (saved) {
        myTokenId = saved;
        showStep(4);
        loadTracking();
        timer = setInterval(loadTracking, 3000);
    }
};


function startClock() {
    setInterval(function () {
        document.getElementById("clock").innerHTML = new Date().toLocaleTimeString();
    }, 1000);
}


// switches between the 4 steps and updates the header
function showStep(n) {
    document.getElementById("step1").className = "hidden";
    document.getElementById("step2").className = "hidden";
    document.getElementById("step3").className = "hidden";
    document.getElementById("step4").className = "hidden";
    document.getElementById("step" + n).className = "";

    document.getElementById("stepLabel").innerHTML = "Step " + n + "/4";

    for (var i = 1; i <= 4; i++) {
        var tab = document.getElementById("tab" + i);
        if (i == n) {
            tab.className = "flex-1 text-center pb-1 border-b-2 border-white";
        } else {
            tab.className = "flex-1 text-center pb-1 border-b-2 border-blue-500 text-blue-200";
        }
    }
}


// FR-01 : service selection
function loadServices() {
    fetch("/api/services")
        .then(function (r) { return r.json(); })
        .then(function (services) {
            var html = "";
            for (var i = 0; i < services.length; i++) {
                var s = services[i];
                html += '<div onclick="pickService(' + s.id + ', \'' + s.name + '\')" ' +
                    'class="border rounded-lg p-4 cursor-pointer hover:border-blue-500 hover:bg-blue-50">' +
                    '<div class="text-2xl mb-1">' + serviceIcon(s.name) + '</div>' +
                    '<div class="text-sm text-gray-800">' + s.name + '</div>' +
                    '</div>';
            }
            document.getElementById("serviceList").innerHTML = html;
        });
}


function serviceIcon(name) {
    if (name == "Hospital") return "&#127973;";
    if (name == "Bank") return "&#127974;";
    if (name == "Government Office") return "&#127963;";
    return "&#128203;";
}


function pickService(id, name) {
    serviceId = id;
    serviceName = name;
    loadLocations();
    showStep(2);
}


// FR-02 : location selection
function loadLocations() {
    fetch("/api/locations?service_id=" + serviceId)
        .then(function (r) { return r.json(); })
        .then(function (locations) {
            var html = "";
            for (var i = 0; i < locations.length; i++) {
                var l = locations[i];
                html += '<div onclick="pickLocation(' + l.id + ', \'' + l.name + '\')" ' +
                    'class="border rounded-lg p-3 cursor-pointer hover:border-blue-500 hover:bg-blue-50">' +
                    '<div class="text-sm text-gray-800">' + l.name + '</div>' +
                    '<div class="text-xs text-gray-500">' + l.organization + '</div>' +
                    '</div>';
            }
            document.getElementById("locationList").innerHTML = html;
        });
}


function pickLocation(id, name) {
    locationId = id;
    locationName = name;
    document.getElementById("pickedService").innerHTML = serviceName;
    document.getElementById("pickedLocation").innerHTML = locationName;
    showStep(3);
}


function goBackToServices() {
    showStep(1);
}


function goBackToLocations() {
    showStep(2);
}


// FR-03 : token generation
function getToken() {
    var name = document.getElementById("customerName").value;
    if (name == "") {
        alert("Please enter your name");
        return;
    }

    fetch("/api/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            customer_name: name,
            service_id: serviceId,
            location_id: locationId
        })
    })
        .then(function (r) { return r.json(); })
        .then(function (token) {
            myTokenId = token.id;
            localStorage.setItem("my_token_id", token.id);
            showStep(4);
            loadTracking();
            timer = setInterval(loadTracking, 3000);
        });
}


// FR-04, FR-05, FR-06 : live tracking, runs every 3 seconds
function loadTracking() {
    fetch("/api/tokens/" + myTokenId)
        .then(function (r) {
            if (r.status == 404) {
                // the queue was reset, start over
                newTicket();
                return null;
            }
            return r.json();
        })
        .then(function (data) {
            if (data == null) return;

            document.getElementById("nowServing").innerHTML = data.now_serving;
            document.getElementById("myToken").innerHTML = data.token_number;
            document.getElementById("waitTime").innerHTML = "~" + data.estimated_wait + " mins";
            document.getElementById("avgNote").innerHTML =
                "Based on avg. " + data.average_time + " min/customer";

            if (data.status == "waiting") {
                document.getElementById("myPosition").innerHTML = ordinal(data.position);
            } else if (data.status == "in_service") {
                document.getElementById("myPosition").innerHTML = "Now";
            } else {
                document.getElementById("myPosition").innerHTML = "Done";
            }

            // the tokens in front of this customer
            var html = "";
            for (var i = 0; i < data.ahead_tokens.length; i++) {
                html += '<span class="bg-blue-100 text-blue-700 rounded px-2 py-1 font-mono">' +
                    data.ahead_tokens[i] + '</span>';
            }
            if (html == "") {
                html = '<span class="text-gray-400">Nobody is ahead of you</span>';
            }
            document.getElementById("aheadList").innerHTML = html;

            // SRS 9 : show a message when staff paused the service
            if (data.paused) {
                document.getElementById("pausedBox").className =
                    "bg-orange-100 border border-orange-300 rounded p-3 mb-3 text-sm text-orange-800";
            } else {
                document.getElementById("pausedBox").className = "hidden";
            }

            if (data.status == "in_service") {
                document.getElementById("yourTurnBox").className =
                    "bg-green-100 border border-green-300 rounded p-3 mb-3 text-sm text-green-800";
            } else {
                document.getElementById("yourTurnBox").className = "hidden";
            }
        });
}


function ordinal(n) {
    if (n == 1) return "1st";
    if (n == 2) return "2nd";
    if (n == 3) return "3rd";
    return n + "th";
}


function newTicket() {
    clearInterval(timer);
    localStorage.removeItem("my_token_id");
    myTokenId = null;
    serviceId = null;
    locationId = null;
    document.getElementById("customerName").value = "";
    showStep(1);
}
