
	"use strict";

	var Parser 		= require("./../js/Parser");

		// Call Reqs are stored here with id and name
		var calls = {};
		var items = {};
		var balls = [];
		var ballObjects = {};
		var currentSolarSystemID = null;
		var currentCharacterID = null;
		var currentSocketPID = null;
		var logging = true;

	Widget.INSTANCE.loadPlugin({
		title: "Overview",
		name: "Robbilie/elw-overview"
	}, plugin => {

		// debugging
		console.log("plugin", plugin);

		var logServer = Widget.getLogServer();
			logServer.on("init", 			initLog);
			logServer.on("character", 		characterLog);
			logServer.on("data", 			processLog);
			logServer.on("disconnect", 		disconnectLog);

		window.onbeforeunload = () => {
			console.log("removing listeners");
			logServer.removeListener("init", 		initLog);
			logServer.removeListener("character", 	characterLog);
			logServer.removeListener("data", 		processLog);
			logServer.removeListener("disconnect", 	disconnectLog);
		};






		var overviewTabs = eowTabs({}, []);
		plugin.getBody().appendChild(overviewTabs);

		var generalTab = overviewTabs.addTab("General");
			updateClientList();

		var settingsTab = overviewTabs.addTab("Settings");

		overviewTabs.selectTab("General");











		function initLog (socket) {
			if(!currentCharacterID)
				updateClientList();
		}

		function characterLog (socket, id, cid) {
			console.warn("CHARACTER", socket.characterID, id, cid);
			console.warn("CHARACTER", socket);
			if(!currentCharacterID)
				updateClientList();
		}

		function disconnectLog (socket) {
			if(currentSocketPID == socket.pid) {
				currentSocketPID = null;
				currentCharacterID = null;
			}

			if(!currentCharacterID)
				updateClientList();
		}

		function updateClientList () {
			generalTab.article
				.clear()
				.appendChild(
					eowEl("div", { className: "pad" }).appendChildren([
						eowEl("ul", { id: "clientlist" }).appendChildren(logServer.getClients().map(socket => 
							eowEl("div", { className: "click" })
								.appendChildren([
									socket.executablePath.split("\\").splice(-1, 1) == "exefile.exe" && socket.settings.characterID ? eowEl("img", { src: `https://imageserver.eveonline.com/Character/${socket.settings.characterID}_32.jpg` }) : null,
									eowEl("span", { innerHTML: socket.executablePath.split("\\").splice(-1, 1) == "exefile.exe" ? "Client" : "Launcher" }),
								])
								.on("click", () => initOverview(socket))
						))
					])
				);
		}

		function initOverview (socket) {
			//if(!socket.characterID)
			//	return;

			currentSocketPID = socket.pid;

			currentCharacterID = socket.characterID;

			generalTab.article
				.clear();

		}

		function processLog (socket, msg) {

			if(socket.characterID != currentCharacterID)
				return;

			// only allow svc
			if(msg.module != "svc" && msg.module != "spacecomponents")
				return;

			if(msg.module == "spacecomponents" && msg.plain.indexOf("Sending 'OnBracketCreated' message to ") != -1) {
				var slim = msg.plain.match(/<slimItem: (.+?)>/);
				slim = slim[1].split(",");
				slim = slim.map(s => s.split("="));
				slim = slim.map(s => s.length == 2 ? (s[0] == "name" ? s[0] + '="' + s[1] + '"' : s[0] + "=" + s[1]) : s[0]);
				slim = slim.join(",");
				var fakepacket = "FakeBracketMgr::OnBracketCreated (FakeBracketMgr::Bracket(" + slim + "))";
				var p = new Parser(fakepacket);
				if(!p.parsed.value)
					return console.log(fakepacket, p.parsed);
				msg.message = p.getResult();
			} else  if(msg.module == "spacecomponents" && msg.plain.indexOf("Sending 'OnRemovedFromSpace' message to ") != -1) {
				msg.message = ["OnRemovedFromSpace", parseInt(msg.plain.split(" ")[4])];
			}

			var data = msg.message;

			// check if actual marshal object
			if(data.constructor.name != "Array")
				return;

			switch (msg.channel) {
				case "eveMachoNet transport":
					processTransportMsg(data);
					break;
				case "common.componentmessenger":
					processSpaceMsg(data);
					break;
				case "space":
				case "default":
					processSpaceMsg(data);
					break;
			}

		}

		function processSpaceMsg (data) {
			if(logging)
				console.log("processSpaceMsg", arguments);

			switch (data[0]) {
				case "Loading":
					//addOverviewItem(data[1]);
					break;
				case "DoBallRemove::spaceMgr":
				case "DoBallRemove::bracketMgr":
				case "DoBallRemove::state":
				case "OnRemovedFromSpace":
					removeOverviewItem(data[1]);
					break;
				case "FakeBracketMgr::OnBracketCreated":
					addOverviewItem(data[1][0][1]);
					break;
			}

		}

		function processTransportMsg (data) {
			if(logging)
				console.log("processTransportMsg", arguments);

			if(data[1][3].constructor.name != "Array")
				return;

			switch (data[0]) {
				case "Packet::CallReq":
					if(data[1][1][1].service[0] == "config")
						calls[data[1][0][1].callID[0]] = data[1][3][1][0];
					break;
				case "Packet::CallRsp":
					processCallRsp(data);
					break;
				case "Packet::SessionChangeNotification":
					processSessionChange(data);
					break;
				case "Packet::Notification":
					processNotification(data);
					break;
			}

		}

		function processCallRsp (data) {
			if(logging)
				console.log("processCallRsp", arguments);

			var callID = data[1][1][1].callID[0];

			if(!calls[callID])
				return;

			switch (calls[callID]) {
				case "GetMultiOwnersEx":
					var arr = data[1][3][0][1];
					for(var i in arr) {
						items[arr[i][0]] = { id: arr[i][0], name: arr[i][1] };
					}
					break;
			}
		}

		function processSessionChange (data) {
			if(logging)
				console.log("processSessionChange", arguments);

			if(data[1][3][1][1].solarsystemid || data[1][3][1][1].solarsystemid2)
				currentSolarSystemID = data[1][3][1][1].solarsystemid ? data[1][3][1][1].solarsystemid[1] : data[1][3][1][1].solarsystemid2[1] ;
		}

		function processNotification (data) {
			if(logging)
				console.log("processNotification", arguments);

			switch (data[1][1][0]) {
				case "Address::BroadCast":

					switch (data[1][1][1].broadcastID[0]) {
						case "OnLSC":
							processLSC(data[1][3][0][1][1][1]);
							break;
						case "DoDestinyUpdate":
							if(data[1][3][0][1] != "error")
								processDestiny(data[1][3][0][1][1][1][0]);
							break;
						case "OnMultiEvent":
							processMulti(data[1][3][0][1][1][1][0]);
							break;
					}

					break;
			}

		}

		function processLSC (data) {

		}

		function processDestiny (data) {
			if(logging)
				console.log("processDestiny", arguments);

			for(var i in data) {
				if(data[i][1])
					switch (data[i][1][0]) {
						case "RemoveBalls":
							filterBalls(data[i][1][1][0]);
							break;
						case "OnSpecialFX":
							break;
					}
			}

		}

		function filterBalls (ballsToBeRemoved) {
			if(logging)
				console.log("filterBalls", arguments);

			ballsToBeRemoved.map(removeOverviewItem);
			//balls = balls.filter(ball => ballsToBeRemoved.indexOf(ball) == -1);
		}

		function processMulti (data) {

		}

		function addOverviewItem (item) {
			if(logging)
				console.log("addOverviewItem", arguments);

			if(balls.some(b => b.itemID == item.itemID))
				return;

			balls.push(item);

			if(!item.name || !item.name[0] || item.name[0] === "")
				return;

			if(!(item.ownerID && item.corpID))
				return;

			if(!item.dirtTime)
				return;

			var ball = eowEl("div", { id: "ball-" + item.itemID });
				ball.item = item;
				ball.appendChildren([
					eowEl("img", { src: `https://imageserver.eveonline.com/Type/${item.typeID}_32.png`, width: 20, height: 20 }),
					eowEl("span", { innerHTML: item.name[0] })
				]);

			if(generalTab.article.children.length === 0)
				generalTab.article.appendChild(ball);
			else {
				var lower = Array.from(generalTab.article.children).find(row => row.item.name > item.name);
				if(lower)
					generalTab.article.insertBefore(ball, lower);
				else
					generalTab.article.appendChild(ball);
			}

		}

		function removeOverviewItem (itemID) {
			if(logging)
				console.log("removeOverviewItem", arguments);

			if($("#ball-" + itemID))
				eowEl($("#ball-" + itemID)).destroy();

			balls = balls.filter(ball => ball.itemID != itemID);
		}

	});
