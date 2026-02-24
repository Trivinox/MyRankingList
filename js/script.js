import { TournamentHeap } from "./heap.js";

let fruits = ["Apple", "Banana", "Orange", "Pear", "Watermelon", "Kiwi", "Mango", "Strawberry", "Grape", "Papaya"];

//Rearrange the order of a list randomly
function rearrange(array) {
    let newArr = array;
    let arrLength = array.length;
    for (let descIndex = arrLength - 1; descIndex >= 0; descIndex--) {
        let randIndex = Math.floor(Math.random() * arrLength);
        if (descIndex != randIndex)
            [newArr[descIndex], newArr[randIndex]] = [newArr[randIndex], newArr[descIndex]];
    }
    return newArr;
}

//Rearrange the fruits array
fruits = rearrange(fruits);

//Create heap from fruits array
let heap = new TournamentHeap(fruits);

//Reference for the buttons
const leftBtn = document.getElementById("leftBtn");
const rightBtn = document.getElementById("rightBtn");

//Get the button presess and update the heap accordingly
leftBtn.addEventListener("click", () => {
    heap.userWinnerIs(true);
    populateButtons();
    showEndResult();
});
rightBtn.addEventListener("click", () => {
    heap.userWinnerIs(false);
    populateButtons();
    showEndResult();
});

//Update buttons when clicking
leftBtn.addEventListener("click", populateButtons);
rightBtn.addEventListener("click", populateButtons);

//Show two names on the buttons
function populateButtons() {
    leftBtn.textContent = heap.leftContestant() || "";
    rightBtn.textContent = heap.rightContestant() || "";
}

//Populate buttons once the page loads
populateButtons();

function showEndResult(){
    if(!heap.completed) return;
    //get the buttons in the container
    let leftBtn = document.getElementById("leftBtn");
    let rightBtn = document.getElementById("rightBtn");
    let results = document.getElementById("results");
    
    //Hide buttons and show end result
    leftBtn.classList.add("hidden");
    rightBtn.classList.add("hidden");
    results.classList.remove("hidden");

    // Clear previous content 
    endResult.innerHTML = "";

    // Add items in vertical ranking style 
    let list = heap.getOrganizedList().slice().reverse();
    list.forEach((item, index) => {
        const div = document.createElement("div");
        div.classList.add("rank-item");
        if (index === 0) {
            div.classList.add("top"); // top result styling 
        }
        div.textContent = `${index + 1}. ${item}`;
        endResult.appendChild(div);
    });
}