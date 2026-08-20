// SmartQueue - admin / staff panel

var locationId = 1;
var counters = [];
var lastCounterOptions = "";


window.onload = function () {
    // staff has to log in first
    var staff = localStorage.getItem("staff_name");
    if (!staff) {
        window.location.href = "login.html";
        return;
    }
    document.getElementById("staffName").innerHTML = staff;

    startClock();
    loadLocations();
};


function startClock() {
    setInterval(function () {
        document.getElementById("clock").innerHTML = new Date().toLocaleTimeString();
    }, 1000);
}


function logout() {
    localStorage.removeItem("staff_name");
    window.location.href = "login.html";
}


function loadLocations() {
    fetch("/api/locations")
        .then(function (r) { return r.json(); })
        .then(function (locations) {
            var html = "";
            for (var i = 0; i < locations.length; i++) {
                html += '<option value="' + locations[i].id + '">' + locations[i].name + '</option>';
            }
            document.getElementById("locationSelect").innerHTML = html;

            loadQueue();
            setInterval(loadQueue, 3000);
        });
}


function changeLocation() {
    locationId = document.getElementById("locationSelect").value;
    loadQueue();
}


// FR-11 : live queue display, refreshes every 3 seconds
function loadQueue() {
    fetch("/api/queue?location_id=" + locationId)
        .then(function (r) { return r.json(); })
        .then(function (data) {

            document.getElementById("nowServing").innerHTML = data.now_serving;
            document.getElementById("servingCounter").innerHTML = data.serving_counter;
            document.getElementById("queueLength").innerHTML = data.queue_length;
            document.getElementById("avgTime").innerHTML = data.average_time;
            document.getElementById("activeCount").innerHTML = data.queue.length + " active tokens";
            document.getElementById("nextTokenBox").value = data.next_token;

            // the queue table
            var html = "";
            for (var i = 0; i < data.queue.length; i++) {
                var row = data.queue[i];
                var badge;
                if (row.status == "In Service") {
                    badge = '<span class="text-green-600">&#9679; In Service</span>';
                } else {
                    badge = '<span class="bg-gray-100 text-gray-600 rounded px-2 py-1 text-xs">Waiting</span>';
                }
                var wait = "-";
                if (row.estimated_wait != null) {
                    wait = "~" + row.estimated_wait + " min";
                }
                html += '<tr class="border-b">' +
                    '<td class="py-3 font-mono text-gray-800">' + row.token_number + '</td>' +
                    '<td class="py-3">' + badge + '</td>' +
                    '<td class="py-3 text-gray-600">' + row.counter + '</td>' +
                    '<td class="py-3 text-gray-600">' + row.time + '</td>' +
                    '<td class="py-3 text-gray-600">' + wait + '</td>' +
                    '</tr>';
            }
            if (html == "") {
                html = '<tr><td colspan="5" class="py-6 text-center text-gray-400">No tokens in the queue</td></tr>';
            }
            document.getElementById("queueTable").innerHTML = html;

            // counters dropdown
            counters = data.counters;
            var options = "";
            var selected = document.getElementById("counterSelect").value;
            for (var i = 0; i < counters.length; i++) {
                var label = counters[i].name;
                if (counters[i].status == "busy") {
                    label = label + " (busy)";
                }
                options += '<option value="' + counters[i].id + '">' + label + '</option>';
            }
            // only rebuild the dropdown when it actually changed, otherwise it
            // closes itself every 3 seconds while the staff is using it
            if (options != lastCounterOptions) {
                lastCounterOptions = options;
                document.getElementById("counterSelect").innerHTML = options;
                if (selected) {
                    document.getElementById("counterSelect").value = selected;
                }
            }

            updateBusyButton();
        });
}


// FR-09 and FR-10 : mark the counter busy or resume it
function toggleBusy() {
    var counterId = document.getElementById("counterSelect").value;
    var counter = findCounter(counterId);
    if (!counter) return;

    var action = "busy";
    if (counter.status == "busy") {
        action = "resume";
    }

    fetch("/api/counters/" + counterId + "/" + action, { method: "POST" })
        .then(function (r) { return r.json(); })
        .then(function () {
            loadQueue();
        });
}


function findCounter(id) {
    for (var i = 0; i < counters.length; i++) {
        if (counters[i].id == id) return counters[i];
    }
    return null;
}


function updateBusyButton() {
    var counterId = document.getElementById("counterSelect").value;
    var counter = findCounter(counterId);
    var button = document.getElementById("busyButton");

    if (counter && counter.status == "busy") {
        button.innerHTML = "&#9654; Resume Service";
        button.className = "border border-green-300 text-green-700 rounded px-3 py-1 text-sm hover:bg-green-50";
    } else {
        button.innerHTML = "&#9888; Mark Counter as Busy";
        button.className = "border border-orange-300 text-orange-700 rounded px-3 py-1 text-sm hover:bg-orange-50";
    }

    // the paused message under the header
    if (counter && counter.status == "busy") {
        document.getElementById("pausedBox").className =
            "bg-orange-100 border border-orange-300 rounded p-3 mb-3 text-sm text-orange-800";
    } else {
        document.getElementById("pausedBox").className = "hidden";
    }
}


// FR-07 and FR-08 : finish the current token and call the next one
function callNext() {
    var counterId = document.getElementById("counterSelect").value;

    fetch("/api/call-next", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            location_id: locationId,
            counter_id: parseInt(counterId)
        })
    })
        .then(function (r) { return r.json(); })
        .then(function (result) {
            if (result.now_serving) {
                document.getElementById("message").innerHTML =
                    "Now serving " + result.now_serving;
            } else {
                document.getElementById("message").innerHTML = result.message;
            }
            loadQueue();
        });
}
