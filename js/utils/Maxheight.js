(function() {
  class Maxheight {
    apply(elem) {
      if (elem.classList.contains("maxheight") && elem.scrollHeight > 500) {
        elem.classList.add("maxheight-limited");
        elem.onclick = function(e) {
          if (e.target === elem) {
            elem.style.maxHeight = elem.scrollHeight + "px";
            elem.classList.remove("maxheight-limited");
            setTimeout(function() {
              elem.classList.remove("maxheight");
              elem.style.maxHeight = null;
            }, 1000);
          }
        };
      } else {
        elem.classList.remove("maxheight-limited");
      }
    }
  }

  window.Maxheight = new Maxheight();
})();
