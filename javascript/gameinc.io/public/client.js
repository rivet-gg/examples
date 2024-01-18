/* Start */
async function start() {
    let res = await fetch("https://api.staging2.gameinc.io/matchmaker/lobbies/find", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
        },
        body: JSON.stringify({
            game_modes: ["default"],
        }),
    });
    if (!res.ok)
        throw "Failed to find lobby: " + res.status + " " + res.statusText;
    let body = await res.json();

    connect(body.lobby);
}

start().catch((err) => {
    alert("Failed to start: " + err);
});

/* Connection */
let socket = null;
function connect(lobby) {
    let port = lobby.ports.default;
    let url = `${port.is_tls ? "https" : "http"}://${port.host}`;
    console.log("Connecting to lobby", url, lobby);
    socket = io(url, {
        query: {
            token: lobby.player.token,
        },
        reconnection: false,
    });

    // Options for employees to hire
    let ignoreDisconnect = false;

    socket.on("connect", () => {
        presentStatus("Initiating...");

        setInterval(() => socket.emit("ping"), 1000);
    });

    socket.on("init", (data) => {
        config = data.config;
        presentModal("startCompanyModal");
    });

    socket.on("message", addToChat);

    socket.on("dead", () => {
        const overlayIntensity = 1;
        const overlay = document.getElementById("overlay");
        overlay.style.opacity = overlayIntensity.toString();
        if (overlayIntensity >= 1) {
            ignoreDisconnect = true;
            socket.close();
            setTimeout(
                () =>
                    presentStatus(
                        "Game over.\nThe IRS is after you.\nPlease reload.",
                    ),
                1000,
            );
        }
    });

    socket.on("leaderboard", (newLeaderboard) => {
        // Save the new leaderboard
        leaderboard = newLeaderboard;

        // Insert empty lists for appropriate leaderboards
        for (let company of leaderboard) {
            // Add to history
            if (leaderboardHistory[company.id] === undefined) {
                leaderboardHistory[company.id] = [];
            }

            // Add to company profiles
            companyProfiles[company.id] = company;
        }

        // Get the new data for every values in the leaderboard history; by doing it this way, we can still track
        // companies that don't exist anymore
        for (let companyId in leaderboardHistory) {
            // Find the amount of money to insert
            const leaderboardCompany = leaderboard.filter(
                (c) => c.id === companyId,
            )[0];
            let moneyValue;
            if (leaderboardCompany !== undefined) {
                moneyValue = leaderboardCompany.money;
            }

            // Add the money
            leaderboardHistory[companyId].splice(0, 0, moneyValue);
            leaderboardHistory[companyId].length = 1800;
        }

        // Draw the new leaderboard
        drawLeaderboard();
    });

    let lastUpdate = undefined;
    socket.on("local update", (newCompany) => {
        // Check if any new games done
        if (company !== undefined) {
            const oldGamesDone = company.games.reduce(
                (a, b) => a + (b.linesOfCode >= b.totalLinesOfCode ? 1 : 0),
                0,
            );
            const newGamesDone = newCompany.games.reduce(
                (a, b) => a + (b.linesOfCode >= b.totalLinesOfCode ? 1 : 0),
                0,
            );
            if (newGamesDone > oldGamesDone) {
                // gameDoneSound.play();
            }
        }

        // Get the amount of money changed
        let deltaMoney = 0;
        if (company !== undefined && lastUpdate !== undefined) {
            deltaMoney =
                (newCompany.money - company.money) /
                ((Date.now() - lastUpdate) / 1000);
        }
        document.getElementById("moneyPerSec").innerText =
            numeral(deltaMoney).format("$0,0") + "/sec";
        document.getElementById("moneyPerYear").innerText =
            numeral(deltaMoney * 365).format("$0,0") + "/year";
        lastUpdate = Date.now();

        // Update the company
        company = newCompany;

        // Update the UI
        document.getElementById("companyNameDisplay").innerText = removeArrows(
            company.name,
        );
        document.getElementById("companyLevelDisplay").innerText = removeArrows(
            Object.keys(config.levels)
                .map((i) => config.levels[i])
                .reverse()
                .find((e) => Math.max(company.money, 0) >= e.startRank).name,
        );
        document.getElementById("moneyDisplay").innerText = numeral(
            company.money,
        ).format("$0,0");
        document.getElementById("createGameButton").disabled =
            company.money < config.createGamePrice;
        document.getElementById("createLawsuitButton").disabled =
            company.money < config.createLawsuitPrice;

        // Combine games and lawsuits and sort by newest to oldest
        const overviewItems = newCompany.games
            .concat(newCompany.lawsuits)
            .sort((a, b) => b.startTime - a.startTime);

        // Clear items and add new ones
        const overviewItemsList = document.getElementById("overviewItems");
        while (overviewItemsList.childElementCount > overviewItems.length) {
            overviewItemsList.removeChild(overviewItemsList.firstChild);
        }
        while (overviewItemsList.childElementCount < overviewItems.length) {
            overviewItemsList.appendChild(createOverviewItemElement());
        }
        for (let i = 0; i < overviewItems.length; i++) {
            const item = overviewItems[i];
            if (item.quality !== undefined) {
                updateGameElement(overviewItemsList.children[i], item);
            } else {
                updateLawsuitElement(overviewItemsList.children[i], item);
            }
        }

        // Update overlay
        const overlayIntensity = Math.max(
            -newCompany.money / config.debtLimit,
            0,
        );
        const overlay = document.getElementById("overlay");
        overlay.style.opacity = overlayIntensity.toString();
        if (overlayIntensity >= 1) {
            ignoreDisconnect = true;
            setTimeout(
                () =>
                    presentStatus(
                        "Game over.\nThe IRS is after you.\nPlease reload.",
                    ),
                1000,
            );
        }

        // Dismiss status modal if present
        if (
            document.getElementById("statusModal").classList.contains("present")
        ) {
            dismissModal();
        }
    });

    socket.on("disconnect", (r) => {
        console.log(r);
        if (!ignoreDisconnect) {
            presentStatus("Disconnected.");
        }
    });
}

/* Game */
let config = undefined;
let leaderboard = [];
let companyProfiles = {};
let leaderboardHistory = {};
var leaderboardHistorySize = 90;
let company = undefined;
let chatOpen = false;
let emojisOpen = false;
let unreadMessages = 0;

const gameTiers = ["🌐", "📱️", "🎮"];
const lawsuitTiers = ["💵", "💰️", "🏦"];
const progressColors = [
    "linear-gradient(to right, #1783FB, #4CD8FC)",
    "linear-gradient(to right, #52B05C, #38FD2F)",
    "linear-gradient(to right, #9954b0, #ca30fd)",
];
const titleColors = ["#25C5FC", "#38FD2F", "#ca30fd"];
const emojis = [
    "b",
    "madman",
    "smile",
    "grin",
    "lmao",
    "cool",
    "relief",
    "laughing",
    "good",
    "evil",
    "wink",
    "nothing",
    "wowok",
    "envy",
    "weary",
    "tired",
    "confused",
    "frustrated",
    "kiss",
    "kiss_heart",
    "kiss_closed_eyes",
    "angry",
    "angery",
    "cry",
    "misery",
    "triumph",
    "crysad",
    "oh",
    "surprized",
    "awe",
    "yawn",
    "embarassed",
    "scared",
    "jaw_drop",
    "embarassing",
    "sleep",
    "dizzy",
    "speechless",
    "mask",
    "sad",
    "happy",
    "upsidedown",
    "rolling",
    "blush",
    "yum",
    "satisfaction",
    "hearteyes",
    "sunglasses",
    "smirk",
    "kiss_pls",
    "tongue",
    "wink_tongue",
    "stuck_out",
    "sad_peep",
    "more_sad_peep",
    "snot",
    "oof",
    "yeesh",
    "waterfall",
    "o",
    "owo",
    "wet",
    "poop",
    "100",
    "eggplant",
    "peach",
];

const chaChingSound = new Audio("./sounds/cha-ching.wav");
const createCompanySound = new Audio("./sounds/create-company.wav");
const createGameSound = new Audio("./sounds/create-game.wav");
const gameDoneSound = new Audio("./sounds/game-done.wav");

/* UI events */
function startCompany() {
    const companyName = document.getElementById("companyNameInput").value;
    socket.emit("start company", companyName);
    presentStatus("Starting company...");

    // createCompanySound.play();
}

function validateCompanyName(value) {
    const isUnique =
        leaderboard.filter((c) => c.name === value.trim()).length === 0;
    document.getElementById("startCompanyButton").disabled =
        !isUnique || value.length <= 3 || value.length > 30;
}

function createGame() {
    presentModal("createGameModal");
}

function finishCreateGame(quality) {
    socket.emit("create game", quality);
    presentStatus("Creating game...");
    finishedTip("createGame");

    // createGameSound.play();
}

function createLawsuit() {
    // Remove existing target options
    const optionHolder = document.getElementById("createLawsuitTargets");
    while (optionHolder.firstChild) {
        optionHolder.removeChild(optionHolder.firstChild);
    }

    // Create default option
    const noneOption = document.createElement("option");
    noneOption.value = "none";
    noneOption.innerText = "Select a company...";
    noneOption.disabled = true;
    noneOption.selected = true;
    optionHolder.appendChild(noneOption);

    // Add new options
    const sueableCompanies = leaderboard
        .filter((c) => c.id !== company.id && c.money >= company.money)
        .sort((a, b) => a.money - b.money);
    for (const company of sueableCompanies) {
        const option = document.createElement("option");
        option.value = company.id;
        option.innerText = `${removeArrows(company.name)} (${numeral(
            company.money,
        ).format("$0.0a")})`;
        optionHolder.appendChild(option);
    }

    // Change state of create buttons
    const finishButtons = document.getElementsByClassName(
        "finishCreateLawsuitButton",
    );
    for (let button of finishButtons) {
        button.disabled = true;
    }
    optionHolder.onchange = () => {
        for (let button of finishButtons) {
            button.disabled = optionHolder.value === noneOption.value;
        }
    };

    // Present the modal
    presentModal("createLawsuitModal");
}

function finishCreateLawsuit(size) {
    socket.emit(
        "create lawsuit",
        size,
        document.getElementById("createLawsuitTargets").value,
    );
    presentStatus("Creating lawsuit...");

    // createGameSound.play();
}

function hireTalent(type, target) {
    // type is "game" or "lawsuit"
    // Request a talent list
    socket.emit("start hiring", type, target.id, (employees) => {
        // Remove existing employees
        const employeeHolders = document
            .getElementById("hireTalentModal")
            .getElementsByClassName("employeeHolder");
        for (let holder of employeeHolders) {
            while (holder.firstChild) {
                holder.removeChild(holder.firstChild);
            }
        }

        // Add new employees
        employeeHolders[0].appendChild(
            createEmployeeElement(employees[0], type),
        );
        employeeHolders[1].appendChild(
            createEmployeeElement(employees[1], type),
        );
        employeeHolders[2].appendChild(
            createEmployeeElement("random", type),
        );

        // Show the modal
        presentModal("hireTalentModal");
    });

    // Present waiting modal
    presentStatus("Selecting employees...");
}

function finishHireTalent(index) {
    // Send finish hiring
    socket.emit("finish hiring", index, () => dismissModal());

    presentStatus("Hiring talent...");

    finishedTip("hireTalent");

    // chaChingSound.play();
}

/* UI rendering */
function createOverviewItemElement() {
    // Div
    const div = document.createElement("div");
    div.classList.add("game");

    // Main info
    const mainInfo = document.createElement("div");
    mainInfo.classList.add("mainInfo");
    div.appendChild(mainInfo);

    const logo = document.createElement("div");
    logo.classList.add("logo");
    mainInfo.appendChild(logo);

    const title = document.createElement("div");
    title.classList.add("title");
    mainInfo.appendChild(title);

    const subtitle = document.createElement("div");
    subtitle.classList.add("subtitle");
    mainInfo.appendChild(subtitle);

    const progress = createProgressBarElement(0.5);
    mainInfo.appendChild(progress);

    // Main employee list
    const employees = document.createElement("div");
    employees.classList.add("employees");
    div.appendChild(employees);

    // Revenue stats
    const revStats = document.createElement("div");
    revStats.classList.add("revStats");
    div.appendChild(revStats);

    // Final revenue
    const revenue = document.createElement("div");
    revenue.classList.add("revenue");
    div.appendChild(revenue);

    // Button to hire new employees
    const hireTalentButton = document.createElement("button");
    hireTalentButton.classList.add("hireTalentButton");
    hireTalentButton.innerText = "Hire Talent";
    div.appendChild(hireTalentButton);

    // Other employee list
    const otherEmployees = document.createElement("div");
    otherEmployees.classList.add("employees");
    div.appendChild(otherEmployees);

    return div;
}

function updateGameElement(div, game) {
    // Configure basics
    div.getElementsByClassName("title")[0].innerText = game.name + ".io";
    div.getElementsByClassName("title")[0].style.color =
        titleColors[game.quality];
    div.getElementsByClassName("subtitle")[0].innerText =
        numeral(game.linesOfCode).format("0,0") +
        "/" +
        numeral(game.totalLinesOfCode).format("0,0") +
        " lines of code";
    div.getElementsByClassName("logo")[0].innerText =
        gameTiers[game.quality];
    div.getElementsByClassName("hireTalentButton")[0].onclick = () =>
        hireTalent("game", game);
    div.getElementsByClassName("hireTalentButton")[0].style.display =
        game.employees.length >= config.employeeLimits[game.quality] ||
        game.linesOfCode >= game.totalLinesOfCode
            ? "none"
            : null;
    setProgress(
        div.getElementsByClassName("progress")[0],
        game.linesOfCode / game.totalLinesOfCode,
    );
    setProgressColor(
        div.getElementsByClassName("progress")[0],
        progressColors[game.quality],
    );

    // Hide the other employee list
    div.getElementsByClassName("employees")[1].hidden = true;

    // Remove employees
    const employeeList = div.getElementsByClassName("employees")[0];
    while (employeeList.firstChild) {
        employeeList.removeChild(employeeList.firstChild);
    }

    // Check if complete
    const revStats = div.getElementsByClassName("revStats")[0];
    const revenue = div.getElementsByClassName("revenue")[0];
    if (game.linesOfCode < game.totalLinesOfCode) {
        // Render employees
        for (let employee of game.employees) {
            employeeList.appendChild(
                createEmployeeElement(employee.profile, "game"),
            );
        }

        // Remove revenue
        revStats.innerText = "";
        revenue.innerText = "";
    } else {
        // Render revenue
        let followers = game.employees.reduce(
            (a, b) => a + b.profile.hype,
            0,
        );
        revStats.innerText =
            numeral(followers).format("0.0a") +
            " followers\n" +
            numeral(game.conversion).format("0.0%") +
            " conversion\n" +
            numeral(game.rpm).format("$0,0.00") +
            " RPM\n" +
            numeral(game.revenueDecay).format("0.0%") +
            " decay/yr\n";
        revenue.innerText = numeral(game.revenue).format("$0,0") + "/yr";
    }
}

function updateLawsuitElement(div, lawsuit) {
    const isComplete = lawsuit.completed;
    const isWinning =
        (lawsuit.progress > 0 && lawsuit.companyA.id === company.id) ||
        (lawsuit.progress < 0 && lawsuit.companyB.id === company.id); // Winner based on progress
    const isWinner =
        (lawsuit.winner === -1 && lawsuit.companyA.id === company.id) ||
        (lawsuit.winner === 1 && lawsuit.companyB.id === company.id); // Winner if finished

    // Get the lawyers
    let myLawyers;
    let otherLawyers;
    if (lawsuit.companyA.id === company.id) {
        myLawyers = lawsuit.lawyersA;
        otherLawyers = lawsuit.lawyersB;
    } else {
        myLawyers = lawsuit.lawyersB;
        otherLawyers = lawsuit.lawyersA;
    }

    // Configure basics
    div.getElementsByClassName("title")[0].innerText = `${removeArrows(
        lawsuit.companyA.name,
    )} vs ${removeArrows(lawsuit.companyB.name)}`;
    div.getElementsByClassName(
        "subtitle",
    )[0].innerText = `Reward: ${numeral(lawsuit.reward).format("$0.0a")}`;
    div.getElementsByClassName("logo")[0].innerText =
        lawsuitTiers[lawsuit.size];
    div.getElementsByClassName("hireTalentButton")[0].onclick = () =>
        hireTalent("lawsuit", lawsuit);
    div.getElementsByClassName("hireTalentButton")[0].style.display =
        myLawyers.length >= config.lawyerLimits[lawsuit.size] || isComplete
            ? "none"
            : null;
    setPositiveAndNegativeProgress(
        div.getElementsByClassName("progress")[0],
        lawsuit.progress / lawsuit.totalProgress,
    );
    setProgressColor(
        div.getElementsByClassName("progress")[0],
        isWinning ? "green" : "red",
    );

    // Remove employees
    const employeeList = div.getElementsByClassName("employees")[0];
    while (employeeList.firstChild) {
        employeeList.removeChild(employeeList.firstChild);
    }

    // Remove other employees
    const otherEmployeeList = div.getElementsByClassName("employees")[1];
    otherEmployeeList.hidden = false;
    while (otherEmployeeList.firstChild) {
        otherEmployeeList.removeChild(otherEmployeeList.firstChild);
    }

    // Check if complete
    const revStats = div.getElementsByClassName("revStats")[0];
    const revenue = div.getElementsByClassName("revenue")[0];
    if (!isComplete) {
        // Render lawyers
        for (let lawyer of myLawyers) {
            employeeList.appendChild(
                createEmployeeElement(lawyer.profile, "lawsuit"),
            );
        }
        for (let lawyer of otherLawyers) {
            otherEmployeeList.appendChild(
                createEmployeeElement(lawyer.profile, "lawsuit"),
            );
        }

        // Remove revenue
        revStats.innerText = "";
        revenue.innerText = "";
    } else {
        // Render revenue
        revStats.innerText = "";
        revenue.innerText =
            (isWinner ? "Won: " : "Lost: ") +
            numeral(lawsuit.reward).format("$0,0");
    }
}

function createEmployeeElement(profile, type) {
    // type is "game" or "lawsuit"
    let employeeColor;
    if (type === "random") {
        employeeColor = "#000000";
    } else {
        if (profile.levelId !== undefined) {
            employeeColor = config.levels[profile.levelId].color;
        } else {
            employeeColor = "#000000";
        }
    }

    const div = document.createElement("div");
    div.classList.add("employee");

    const image = document.createElement("div");
    image.classList.add("image");
    image.style.backgroundImage =
        "url(profiles/" +
        (profile === "random" ? "Random" : encodeURI(profile.name)) +
        ".png)";
    div.appendChild(image);

    const infoHolder = document.createElement("div");
    infoHolder.classList.add("infoHolder");
    div.appendChild(infoHolder);

    const nameLabel = document.createElement("div");
    nameLabel.classList.add("label");
    nameLabel.classList.add("name");
    nameLabel.innerText = profile === "random" ? "Random" : profile.name;
    nameLabel.style.color = employeeColor;
    infoHolder.appendChild(nameLabel);

    const salaryLabel = document.createElement("div");
    salaryLabel.classList.add("label");
    salaryLabel.innerText =
        "Salary: " +
        (profile === "random"
            ? "?"
            : numeral(profile.salary).format("$0,0")) +
        "/year";
    infoHolder.appendChild(salaryLabel);

    const workSpeedLabel = document.createElement("div");
    workSpeedLabel.classList.add("label");
    workSpeedLabel.innerText = "Work speed: ";
    if (type === "game") {
        workSpeedLabel.innerText +=
            (profile === "random"
                ? "?"
                : numeral(profile.workSpeed).format("0,0")) + " loc/s";
    } else if (type === "lawsuit") {
        workSpeedLabel.innerText +=
            (profile === "random"
                ? "?"
                : numeral(profile.workSpeed * 100).format("0.00")) + "";
    }
    infoHolder.appendChild(workSpeedLabel);

    if (type === "game") {
        const hypeLabel = document.createElement("div");
        hypeLabel.classList.add("label");
        hypeLabel.innerText =
            "Hype: " +
            (profile === "random"
                ? "?"
                : numeral(profile.hype).format("0.0a")) +
            " followers";
        infoHolder.appendChild(hypeLabel);
    }

    return div;
}

function createProgressBarElement(progress) {
    const div = document.createElement("div");
    div.classList.add("progress");

    const inner = document.createElement("div");
    inner.classList.add("progressInner");
    div.appendChild(inner);

    const centerLine = document.createElement("div");
    centerLine.classList.add("progressCenterLine");
    div.appendChild(centerLine);

    setProgress(div, progress);

    return div;
}

function updatePerSec() {}

function setProgress(progressBarElement, progress) {
    progressBarElement.classList.remove("positiveNegative");
    const inner =
        progressBarElement.getElementsByClassName("progressInner")[0];
    inner.style.width = Math.round(progress * 100) + "%";
}

function setPositiveAndNegativeProgress(progressBarElement, progress) {
    progressBarElement.classList.add("positiveNegative");
    const inner =
        progressBarElement.getElementsByClassName("progressInner")[0];
    inner.style.width = Math.round(Math.abs(progress / 2) * 100) + "%"; // Half of the absolute progress
    inner.style.transform = progress < 0 ? "scaleX(-1)" : ""; // Flip X if negative
}

function setProgressColor(progressBarElement, color) {
    progressBarElement.getElementsByClassName(
        "progressInner",
    )[0].style.background = color;
}

/* Fetch writing code */
// Get the code to write
let codeWriting = " ";
let codeIndex = 0;
const txtFile = new XMLHttpRequest();
txtFile.open("GET", "./hackerCode.txt", true);
txtFile.onreadystatechange = function () {
    if (txtFile.readyState === 4) {
        // Makes sure the document is ready to parse.
        if (txtFile.status === 200) {
            // Makes sure it's found the file.
            codeWriting = txtFile.responseText;
        }
    }
};
txtFile.send(null);

/* Code writing */
let lastKeyCode = undefined;
document.addEventListener("keydown", (e) => {
    // Make sure the key isn't already pressed and not repeating
    if (e.code === lastKeyCode) {
        return;
    }
    lastKeyCode = e.code;

    // Write the code
    if (!chatOpen) {
        writeCode();
    }
});

document.getElementById("chatInput").addEventListener("keydown", (e) => {
    if (e.keyCode == 13) {
        if (chatInput.value.trim() == "") {
            chatInput.value = "";
        } else {
            socket.emit("new message", chatInput.value.trim());
            chatInput.value = "";
        }
    }
});

document.addEventListener("keyup", (e) => {
    // Let the key be pressed again
    lastKeyCode = undefined;
});

function writeCode() {
    // Only do it if no input selected and has no modal
    if (hasModal() || document.activeElement instanceof HTMLInputElement) {
        return;
    }

    // Add the code
    const codePanel = document.getElementById("codeArea");
    let appendText = "";
    let newText = document.createElement("span");
    newText.className = "code";
    for (let i = 0; i < 5; i++) {
        // Add the character
        const char = codeWriting[codeIndex % codeWriting.length];
        appendText += char;
        codeIndex++;

        // Don't count space characters
        if (char === " ") {
            i--;
        }
    }
    newText.innerText = appendText;

    codePanel.appendChild(newText);

    if (document.getElementsByClassName("code").length > 500) {
        document.getElementsByClassName("code")[0].remove();
    }

    // Emit message
    socket.emit("make money");

    // Finished tip
    finishedTip("code");
}

/* Tips */
const allTips = [
    ["code", "Press buttons on the keyboard to write code and make money."],
    [
        "createGame",
        'Click "New Game" to create a new game and start making more money. This costs $5,000.',
    ],
    [
        "hireTalent",
        'Click "Hire Talent" to add a programmer to start developing the game.',
    ],
    [
        "hireTalent",
        'Click "Hire Talent" again to hire an influencer to increase the value of the game before release.',
    ],
    [
        "dontClose",
        "Leave the page open in the background to keep gaining money while doing other things.",
    ],
];
let tipIndex = 0;
function finishedTip(key) {
    // If finished the current active tip and not the last tip, then update the tip
    if (allTips[tipIndex][0] === key && tipIndex !== allTips.length - 1) {
        tipIndex++;
        renderTip();
    }
}
function renderTip() {
    document.getElementById("tipsBody").innerText = allTips[tipIndex][1];
}

/* Modal Controller */
function hasModal() {
    return document.querySelector(".modal.present") !== null;
}

function presentModal(id) {
    dismissModal();
    document.getElementById(id).classList.add("present");
}

function dismissModal() {
    const modal = document.querySelector(".modal.present");
    if (modal !== null) {
        modal.classList.remove("present");
    }
}

function presentStatus(status) {
    document.getElementById("statusText").innerText = status;
    presentModal("statusModal");
}

/* Prevent closing */
window.addEventListener("beforeunload", (e) => {
    const confirmationMessage =
        "Are you sure you want to leave? You will lose your progress.";
    (e || window.event).returnValue = confirmationMessage;
    return confirmationMessage;
});

/* On load */
window.addEventListener("load", () => {
    // Render the tips
    renderTip();
});

const leaderboardColors = [
    "Blue",
    "BlueViolet",
    "Brown",
    "BurlyWood",
    "CadetBlue",
    "Chartreuse",
    "Chocolate",
    "Coral",
    "CornflowerBlue",
    "Crimson",
    "Cyan",
    "DarkBlue",
    "DarkCyan",
    "DarkGoldenRod",
    "Gold",
    "GoldenRod",
    "Gray",
    "Grey",
    "Green",
    "GreenYellow",
    "Olive",
    "OliveDrab",
    "Orange",
    "OrangeRed",
    "Orchid",
    "SpringGreen",
    "SteelBlue",
    "Tan",
    "Teal",
    "Thistle",
    "Tomato",
    "Turquoise",
    "Violet",
];

let nowMoney = 0;
let previousMoney = nowMoney;
function drawLeaderboard() {
    previousMoney = nowMoney;
    const canvas = document.getElementById("leaderboardGraph");
    const w = Math.floor(window.innerWidth - 400);
    const h = Math.floor(window.innerHeight * 0.55 - 55);
    canvas.style.width = w;
    canvas.style.height = h;

    // Get the range of values
    let minValue = Number.POSITIVE_INFINITY;
    let maxValue = Number.NEGATIVE_INFINITY;
    var timelineSizeNow = document.getElementsByName("timelineSize");
    for (var i = 0, length = timelineSizeNow.length; i < length; i++) {
        if (timelineSizeNow[i].checked) {
            // do whatever you want with the checked radio
            leaderboardHistorySize = timelineSizeNow[i].value;

            // only one radio can be logically checked, don't check the rest
            break;
        }
    }
    if (document.getElementById("localViewCheckbox").checked) {
        document.getElementById("localZoom").style.display = "inline-block";
        const range = 200000 * (localZoom.value / 100);
        minValue = (company.money || 0) - range / 2;
        maxValue = (company.money || 0) + range / 2;
    } else {
        document.getElementById("localZoom").style.display = "none";
        for (let company in leaderboardHistory) {
            for (let value of leaderboardHistory[company]) {
                if (value < minValue) {
                    minValue = value;
                }
                if (value > maxValue) {
                    maxValue = value;
                }
            }
        }
        minValue -= 1;
        maxValue += 1;

        // Pad the min and max
        const valueRange = maxValue - minValue;
        minValue -= valueRange * 0.2;
        maxValue += valueRange * 0.2;
    }

    // Calculate values
    let lineEndW = w - 250;
    const step = lineEndW / leaderboardHistorySize + 1;

    // Draw the values
    let colorIndex = 0;
    let tmpPoints;
    let tmpText = "";
    for (let key in leaderboardHistory) {
        tmpPoints = [];
        const history = leaderboardHistory[key];
        const companyColor =
            leaderboardColors[colorIndex++ % leaderboardColors.length];
        const companyData = companyProfiles[key];

        // Draw a line between each pair of values
        let localLineEndW = lineEndW;
        for (let i = 0; i < history.length - 1; i++) {
            // Make sure there is a value
            if (history[i] === undefined || history[i + 1] === undefined) {
                continue;
            }

            // Draw the line
            if (history[i] !== undefined) {
                if (
                    !isNaN(adjustValue(history[i], minValue, maxValue, h))
                ) {
                    tmpPoints.push([
                        localLineEndW - i * step,
                        adjustValue(history[i], minValue, maxValue, h),
                    ]);
                }
            }
        }
        if (tmpPoints.length > 0) {
            tmpText += svgPath(
                tmpPoints,
                bezierCommand,
                companyColor,
                company !== undefined && key === company.id ? 8 : 3,
            );
        }

        //Don't (attempt to) draw dead names
        if (typeof history[0] == "undefined") continue;

        // Draw the title
        const money = numeral(history[0]).format("$0.0a");
        if (company !== undefined && key === company.id) {
            tmpText += `<text x="${localLineEndW + 10}" y="${adjustValue(
                history[0],
                minValue,
                maxValue,
                h,
            )}" font-weight="bold" font-family="Biryani" fill="${companyColor}" font-size="12">${
                "(" + money + ") " + removeArrows(companyData.name)
            }</text>`;
        } else {
            tmpText += `<text x="${localLineEndW + 10}" y="${adjustValue(
                history[0],
                minValue,
                maxValue,
                h,
            )}" font-family="Biryani" fill="${companyColor}" font-size="10">${
                "(" + money + ") " + removeArrows(companyData.name)
            }</text>`;
        }
        // ctx.fillText("(" + money + ") " + (key === company.id ? "You" : key), lineEndW + 5, adjustValue(history[0], minValue, maxValue, h));
    }
    // Draw a line at 0 and draw horizontal grid lines

    const adjustedZero = adjustValue(0, minValue, maxValue, h);
    tmpText += svgPath(
        [
            [0, adjustedZero],
            [w, adjustedZero],
        ],
        bezierCommand,
        "rgba(0,0,0,0.5)",
        5,
    );

    let maxyValue;
    let minyValue;

    if (minValue !== Infinity) {
        let positiveGridBars = adjustValue(0, minValue, maxValue, h) / 85;

        for (let i = 1; i <= positiveGridBars; i++) {
            maxyValue = adjustValue(
                (maxValue / positiveGridBars) * i,
                minValue,
                maxValue,
                h,
            );
            if (maxyValue > h) continue;
            tmpText += `<text x="5" y="${
                maxyValue - 3
            }" font-family="Biryani" fill="rgba(0,0,0,0.2)" font-size="10">${numeral(
                (maxValue / positiveGridBars) * i,
            ).format("$0.0a")}</text>`;
            tmpText += svgPath(
                [
                    [0, maxyValue],
                    [w, maxyValue],
                ],
                bezierCommand,
                "rgba(0,0,0,0.2)",
                1,
            );
        }

        let negativeGridBars =
            (h - adjustValue(0, minValue, maxValue, h)) / 85;

        for (let i = 1; i <= negativeGridBars; i++) {
            minyValue = adjustValue(
                (minValue / negativeGridBars) * i,
                minValue,
                maxValue,
                h,
            );
            if (minyValue < 0) continue;
            tmpText += `<text x="5" y="${
                minyValue - 3
            }" font-family="Biryani" fill="rgba(0,0,0,0.2)" font-size="10">${numeral(
                (minValue / negativeGridBars) * i,
            ).format("$0.0a")}</text>`;
            tmpText += svgPath(
                [
                    [0, minyValue],
                    [w, minyValue],
                ],
                bezierCommand,
                "rgba(0,0,0,0.2)",
                1,
            );
        }

        const zeroY = adjustValue(0, minValue, maxValue, h);
        tmpText += svgPath(
            [
                [0, zeroY],
                [w, zeroY],
            ],
            bezierCommand,
            "rgba(0,0,0,0.2)",
            5,
        );
    }

    //Insert all lines + text into the svg element
    canvas.innerHTML = tmpText;
}

function adjustValue(value, min, max, height) {
    return height - ((value - min) / (max - min)) * height;
}

const points = [
    [5, 10],
    [10, 40],
    [40, 30],
    [60, 5],
    [90, 45],
    [120, 10],
    [150, 45],
    [200, 10],
];
const line = (pointA, pointB) => {
    const lengthX = pointB[0] - pointA[0];
    const lengthY = pointB[1] - pointA[1];
    return {
        length: Math.sqrt(Math.pow(lengthX, 2) + Math.pow(lengthY, 2)),
        angle: Math.atan2(lengthY, lengthX),
    };
};

const controlPoint = (current, previous, next, reverse) => {
    const p = previous || current;
    const n = next || current;
    const smoothing = 0.2;
    const o = line(p, n);
    const angle = o.angle + (reverse ? Math.PI : 0);
    const length = o.length * smoothing;
    const x = current[0] + Math.cos(angle) * length;
    const y = current[1] + Math.sin(angle) * length;
    return [x, y];
};

const svgPath = (points, command, color, width) => {
    const d = points.reduce(
        (acc, point, i, a) =>
            i === 0
                ? `M ${point[0]},${point[1]}`
                : `${acc} ${command(point, i, a)}`,
        "",
    );
    return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round" />`;
};

const bezierCommand = (point, i, a) => {
    const [cpsX, cpsY] = controlPoint(a[i - 1], a[i - 2], point);
    const [cpeX, cpeY] = controlPoint(point, a[i - 1], a[i + 1], true);
    return `C ${cpsX},${cpsY} ${cpeX},${cpeY} ${point[0]},${point[1]}`;
};
const removeArrows = (text) => {
    return text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
};

function addToChat(chatObject) {
    if (!chatOpen) {
        if (unreadMessages == 0) {
            let newDiv = document.createElement("div");
            newDiv.id = "newMessages";
            newDiv.innerHTML = "new messages";
            document.getElementById("chatArea").appendChild(newDiv);
        }
        unreadMessages++;
        document.getElementById("unreadNotification").innerHTML =
            unreadMessages;
    }
    let chatClient = document.getElementById("chatArea");
    let tmpMessage = document.createElement("div");
    tmpMessage.className = chatObject.special
        ? "chatMessageSpecial"
        : "chatMessage";
    chatObject.msg = chatObject.msg.replace(/\\:/g, ":");
    for (let i = 0; i < emojis.length; i++) {
        chatObject.msg = chatObject.msg.replace(
            new RegExp(`:${emojis[i]}:`, "g"),
            `<img class="inline" src="emojis/${emojis[i]}.png"></img>`,
        );
    }
    tmpMessage.innerHTML =
        (chatObject.id
            ? '<span style="color: ' +
              leaderboardColors[
                  Object.keys(leaderboardHistory).indexOf(
                      Object.keys(leaderboardHistory).filter((value) => {
                          return value == chatObject.id;
                      })[0],
                  ) % leaderboardColors.length
              ] +
              ';">' +
              removeArrows(
                  leaderboard.filter((value) => {
                      return value.id == chatObject.id;
                  })[0].name,
              ) +
              "</span>"
            : "") +
        chatObject.msg +
        (chatObject.amount
            ? " for <b>" +
              numeral(chatObject.amount).format("$0,0") +
              "</b>"
            : "");
    chatClient.appendChild(tmpMessage);
    if (window.navigator.userAgent.indexOf("Edge") > -1) return;
    chatClient.scrollTo(0, chatClient.scrollHeight);
}

function openChat() {
    document.getElementById("codePanel").style.display = "none";
    document.getElementById("chatPanel").style.display = "block";
    document.getElementById("chatInput").focus();
    chatOpen = true;
    if (window.navigator.userAgent.indexOf("Edge") > -1) return;
    document
        .getElementById("chatArea")
        .scrollTo(0, document.getElementById("chatArea").scrollHeight);
}
function closeChat() {
    document.getElementById("codePanel").style.display = "block";
    document.getElementById("chatPanel").style.display = "none";
    chatOpen = false;
    unreadMessages = 0;
    document.getElementById("unreadNotification").innerHTML =
        unreadMessages;
    if (document.getElementById("newMessages")) {
        document.getElementById("newMessages").remove();
    }
}

function toggleEmojis() {
    if (emojisOpen) {
        document.getElementById("emojiList").style.display = "none";
        emojisOpen = false;
    } else {
        fillEmojis();
        document.getElementById("emojiList").style.display = "block";
        emojisOpen = true;
    }
}

function fillEmojis() {
    document.getElementById("emojiList").innerHTML = "";
    for (let tmpEmoji in emojis) {
        document.getElementById(
            "emojiList",
        ).innerHTML += `<img class="inline" src="emojis/${emojis[tmpEmoji]}.png"></img> :${emojis[tmpEmoji]}:<br>`;
    }
}

Element.prototype.remove = function () {
    this.parentElement.removeChild(this);
};
NodeList.prototype.remove = HTMLCollection.prototype.remove = function () {
    for (var i = this.length - 1; i >= 0; i--) {
        if (this[i] && this[i].parentElement) {
            this[i].parentElement.removeChild(this[i]);
        }
    }
};
