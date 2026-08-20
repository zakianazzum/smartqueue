// SmartQueue - public counter display (FR-12)

var locationId = 1;


window.onload = function () {
    showDate();
    startClock();
    loadLocations();
};


function startClock() {
    setInterval(function () {
        var now = new Date().toLocaleTimeString();
        document.getElementById("clock").innerHTML = now;
        document.getElementById("bigClock").innerHTML = now;
    }, 1000);
}


function showDate() {
    var options = { weekday: "short", year: "numeric", month: "long", day: "numeric" };
    document.getElementById("today").innerHTML = new Date().toLocaleDateString("en-US", options);
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

            loadDisplay();
            setInterval(loadDisplay, 3000);
        });
}


function changeLocation() {
    locationId = document.getElementById("locationSelect").value;
    loadDisplay();
}


// FR-12 : public display of the current service and queue information
function loadDisplay() {
    fetch("/api/queue?location_id=" + locationId)
        .then(function (r) { return r.json(); })
        .then(function (data) {

            document.getElementById("nowServing").innerHTML = data.now_serving;
            document.getElementById("nextToken").innerHTML = data.next_token;
            document.getElementById("queueLength").innerHTML = data.queue_length;
            document.getElementById("avgTime").innerHTML = data.average_time + " mins";
            document.getElementById("counterName").innerHTML = data.serving_counter;

            // find the counter that is open right now
            var active = "-";
            for (var i = 0; i < data.counters.length; i++) {
                if (data.counters[i].status == "available") {
                    active = data.counters[i].name;
                    break;
                }
            }
            document.getElementById("activeCounter").innerHTML = active;

            // waiting token chips
            var html = "";
            for (var i = 0; i < data.waiting_tokens.length; i++) {
                html += '<span class="bg-blue-800 text-blue-100 rounded px-3 py-1 font-mono text-sm">' +
                    data.waiting_tokens[i] + '</span>';
            }
            if (html == "") {
                html = '<span class="text-blue-400 text-sm">No one is waiting</span>';
            }
            document.getElementById("waitingList").innerHTML = html;

            // SRS 9 : tell the people waiting that the service stopped
            if (data.paused) {
                document.getElementById("pausedBox").className =
                    "bg-orange-500 text-white text-center py-2 text-sm";
            } else {
                document.getElementById("pausedBox").className = "hidden";
            }
        });
}
