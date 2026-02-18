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
});
rightBtn.addEventListener("click", () => {
    heap.userWinnerIs(false);
    populateButtons();
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