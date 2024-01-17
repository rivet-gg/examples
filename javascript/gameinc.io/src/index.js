const http = require("http");
const { Server } = require("socket.io");
const rivet = require("@rivet-gg/api");

const rivetClient = new rivet.RivetClient({
    environment: process.env.RIVET_API_ENDPOINT,
    token: process.env.RIVET_TOKEN,
})
rivetClient.matchmaker.lobbies.ready({}).then(() => console.log("Lobby ready"));

const { Company } = require("./Company");
const { Game } = require("./Game");
const { Lawsuit } = require("./Lawsuit");
const config = require("./config");

const listenPort = process.env.PORT || 8080;
const io = new Server(listenPort, {
    cors: {
        origin: "*"
    }
});
console.log("Listening on " + listenPort);

// Game state
const companies = [];
const bannedText = [
"௵",
"꧄",
"ဪ",
"꧅",
"⸻",
"𒌄",
"𒈟",
"𒍼",
"𒁎",
"𒀱",
"𒌧",
"𒅃",
"𒈓",
"𒍙",
"𒊎",
"𒄡",
"𒅌",
"𒁏",
"𒀰",
"𒐪",
"𒈙",
"𒐫",
"﷽"
];

// Update
let lastUpdate = 0;
let updateIndex = 0;
setInterval(() => {
    const now = Date.now();
    const dt = (now - lastUpdate) / 1000;
    lastUpdate = now;

    // Update companies
    for (let company of companies) {
        company.update(dt);
        if (company.money <= -config.debtLimit || company.disconnected){
            company.disconnected = true;
            company.socket.emit('dead');

            io.emit('message',{
                special: true,
                msg: "<b>"+removeArrows(company.name)+"</b> has gone backrupt."
            });
            for (let i = 0; i < companies.length; i++) {
                if (companies[i] === company) {
                    companies.splice(i, 1);
                    break;
                }
            }
        }
        sendLocalUpdate(company.socket, company);
    }

    // Broadcast leaderboards
    if (updateIndex % 3 === 0) {
        const leaderboardData = companies.sort((a, b) => b.money - a.money).map(c => c.serializeLeaderboard());
        io.sockets.emit("leaderboard", leaderboardData);
    }

    // Increment update
    updateIndex++;
}, 500);

// Handle network
io.on("connection", async socket => {
    let playerToken = socket.handshake.query.token;
    try {
        await rivetClient.matchmaker.players.connected({ playerToken });
    } catch (err) {
        console.warn("Failed to connect player", playerToken, err);
        socket.disconnect();
        return;
    }

    let company = undefined;
    let lastMessage = Date.now();
    let spamCount = 0;

    socket.emit("init", { config });

    socket.on("start company", name => {
        if (typeof name !== "string") return;
        name = name.substring(0, 30).trim();
        if (company !== undefined) return;
        if (companies.filter(c => c.name === name).length !== 0) return;

        // Insert the company
        company = new Company(socket, name);
        companies.push(company);

        // Send update
        sendLocalUpdate(socket, company);
    });

    /* Make money */
    let lastMakeMoneyTime = 0;
    socket.on("make money", () => {
        if (company === undefined) return;
        if (Date.now() - lastMakeMoneyTime < 100) return;

        // Make money
        company.makeMoney();
        lastMakeMoneyTime = Date.now();
    });

    /* Games */
    socket.on("create game", quality => {
        if (company === undefined || company.money < config.createGamePrice) return;
        if (!Number.isInteger(quality) || quality < 0 || quality > 2) return;

        // Choose game name
        const possibleGameNames = config.gameNames[quality];
        let gameName = possibleGameNames[Math.floor(Math.random() * possibleGameNames.length)];

        // Find the first available sequel
        let gameVersion = 1;
        while (company.games.filter(g => g.name === gameName + (gameVersion === 1 ? "" : gameVersion)).length > 0) {
            gameVersion++;
        }
        gameName += (gameVersion === 1 ? "" : gameVersion);

        // Create game
        const game = new Game(company, gameName, quality);
        company.games.push(game);

        // Remove games with income <= 100$/yr
        for (let i = 0; i < company.games.length; i++) {
            var oldgame = company.games[i];
            if (oldgame.isFinished && oldgame.revenue <= 100) {
                company.games.splice(i, 1);
            }
        }

        // Take money
        company.money -= config.createGamePrice;

        // Send update
        sendLocalUpdate(socket, company);
    });

    /* Lawsuits */
    socket.on("create lawsuit", (size, companyID) => {
        if (company === undefined || company.money < config.createLawsuitPrice) return;
        if (!Number.isInteger(size) || size < 0 || size > 2) return;

        // Find the target company
        let target = companies.filter(c => c.id === companyID)[0];
        if (target === undefined) return;
        if (target.money < company.money) return;

        // Make sure it's not the same company
        if (companyID === company.id) return;

        // Create the lawsuit
        const lawsuit = new Lawsuit(size, company, target);
        company.lawsuits.push(lawsuit);
        target.lawsuits.push(lawsuit);

        // Take money
        company.money -= config.createLawsuitPrice;

        // Send update
        sendLocalUpdate(socket, company);

        io.emit('message',{
            special: true,
            amount: lawsuit.reward,
            msg: "<b>"+removeArrows(company.name)+"</b> has started a lawsuit against <b>"+removeArrows(target.name)+"</b>"
        });
    });

    /* Messages */
    socket.on('new message', function(text){
        if (company){
            if (typeof text != 'string'){
                return;
            }
            let message = text.substr(0,180).trim();
            let badText = false;
            if (message.trim() == ''){
                return;
            }
            if (spamCount == 11 || company.muted){
                socket.emit('message',{
                    special: true,
                    msg: 'You have been muted from chat.'
                });
            }
            else{
                if (Date.now()-lastMessage > 900 && spamCount != 11){
                    for(var i = 0; i < bannedText.length; i++){
                        if (message.indexOf(bannedText[i]) != -1){
                            socket.emit('message',{
                                special: true,
                                msg:'The text you sent is banned in chat.'
                            });
                            badText = true;
                            break;
                        }
                    }
                }
                if (badText){
                    return;
                }
                else{
                    if (Date.now()-lastMessage > 900){
                        lastMessage = Date.now();
                        if (message == '/login admin_abc556'){
                            company.admin = true;
                            socket.emit('message',{
                                special: true,
                                msg: 'You are now admin.'
                            });
                            return;
                        }
                        if (message.startsWith('/mute ') && company.admin){
                            var found;
                            var regex = message.substr(6);
                            for (let i = 0; i < companies.length; i++) {
                                if (companies[i].id === regex || companies[i].name === regex) {
                                    companies[i].muted = true;
                                    socket.broadcast.emit('message',{
                                        special: true,
                                        msg: '<b>'+removeArrows(companies[i].name)+'</b> has been muted.'
                                    });
                                    break;
                                }
                            }
                            return;
                        }
                        if (message.startsWith('/unmute ') && company.admin){
                            var found;
                            var regex = message.substr(8);
                            for (let i = 0; i < companies.length; i++) {
                                if (companies[i].id === regex || companies[i].name === regex) {
                                    companies[i].muted = false;
                                    socket.broadcast.emit('message',{
                                        special: true,
                                        msg: '<b>'+removeArrows(companies[i].name)+'</b> has been unmuted.'
                                    });
                                    break;
                                }
                            }
                            return;
                        }
                        io.emit('message',{
                            id: company.id,
                            msg: removeArrows(message)
                        });
                    }
                    else{
                        spamCount++;
                        if (spamCount == 11){
                            socket.emit('message',{
                                special: true,
                                msg: 'You have been muted from chat.'
                            });
                            socket.broadcast.emit('message',{
                                special: true,
                                msg: '<b>'+removeArrows(company.name)+'</b> has been muted for spamming.'
                            });
                            return;
                        }
                        socket.emit('message',{
                            special: true,
                            name: '',
                            msg: 'Please dont spam. (warning '+spamCount+'/10)'
                        });
                    }
                }
            }
        }
    });
    let lastHireTime = 0;
    socket.on("start hiring", (type, target, callback) => {
        if (company === undefined) return;
        if (Date.now() - lastHireTime < 1200) return;
        lastHireTime = Date.now();
        // Validate the type and target
        if (type === "game") {
            if (company.games.filter(g => g.id === target).length !== 1) return;
        } else if (type === "lawsuit") {
            if (company.lawsuits.filter(l => l.id === target).length !== 1) return;
        } else {
            return;
        }

        // Select hiring options
        company.selectHiringOptions(type, target);

        // Send response
        if (type == "game") {
            callback(company.currentHiringOptions.map(o => o.serialize()));
        } else {
            callback(company.currentHiringOptions2.map(o => o.serialize()));
        }
    });
    let lastFinishHireTime = 0;
    socket.on("finish hiring", (index, callback) => {
        if (Date.now() - lastFinishHireTime < 1200) return;
        lastFinishHireTime = Date.now();
        if (!Number.isInteger(index) || index < -1 || index > 2 || !callback || !company) return;

        // Hire the employee
        company.hireWithIndex(index);

        // Send new company
        sendLocalUpdate(socket, company);

        // Send response
        callback();
    });

    /* Disconnect */
    socket.on("disconnect", async () => {
        try {
            await rivetClient.matchmaker.players.disconnected({ playerToken });
        } catch (err) {
            console.warn("Failed to disconnect player", playerToken, err);
        }

        if (company !== undefined) {
            // Set company as left
            company.disconnected = true;

            // Remove the company from the list
            for (let i = 0; i < companies.length; i++) {
                if (companies[i] === company) {
                    companies.splice(i, 1);
                    break;
                }
            }
        }
    });
});

function sendLocalUpdate(socket, company) {
    socket.emit("local update", company.serializeLocal());
}

function removeArrows(text){
    return text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
