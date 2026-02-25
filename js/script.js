import { TournamentHeap } from "./heap.js";

const inputArea = document.getElementById("input-area");
const input = document.getElementById("valueInput");
const submitBtn = document.getElementById("submitBtn");
const userList = document.getElementById("user-list");
const mainContainer = document.getElementById("mainContainer");
const inputPage = document.getElementsByClassName("input-page")[0];
//Reference for the buttons
const leftBtn = document.getElementById("leftBtn");
const rightBtn = document.getElementById("rightBtn");
//For the final list
const results = document.getElementById("results");
const endResult = document.getElementById("endResult");

let values = [];
let heap = null;

function addUserItem() {
    const val = input.value.trim();
    if (val && values.length < 50) {
        values.push(val);

        const item = document.createElement("div");
        item.classList.add("user-item");
        item.textContent = val;
        userList.appendChild(item);

        input.value = "";
    }
};

inputArea.addEventListener("submit", (e) => {
    e.preventDefault();
    addUserItem();
})

submitBtn.addEventListener("click", () => {
    if(values.length < 2){
        alert("Debes ingresar al menos 2 valores.");
        return;
    }
    console.log("Valores enviados:", values);
    alert("Valores registrados:\n" + values.join(", "));

    // Show container, hide input list
    mainContainer.classList.remove("hidden");
    inputPage.classList.add("hidden");
    
    
    //Rearrange the fruits array
    values = rearrange(values);
    //Create heap from fruits array
    heap = new TournamentHeap(values);
    //Populate buttons 
    populateButtons();
});

//let fruits = ["Apple", "Banana", "Orange", "Pear", "Watermelon", "Kiwi", "Mango", "Strawberry", "Grape", "Papaya"];

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


function showEndResult(){
    if(!heap.completed) return;
    
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