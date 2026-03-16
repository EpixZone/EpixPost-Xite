(function() {

  class Animation {
    slideDown(elem, props) {
      var h = elem.offsetHeight;
      var cstyle = window.getComputedStyle(elem);
      var margin_top = cstyle.marginTop;
      var margin_bottom = cstyle.marginBottom;
      var padding_top = cstyle.paddingTop;
      var padding_bottom = cstyle.paddingBottom;
      var border_top_width = cstyle.borderTopWidth;
      var border_bottom_width = cstyle.borderBottomWidth;

      if (window.Animation.shouldScrollFix(elem, props)) {
        var top_after = document.body.scrollHeight;
        var next_elem = elem.nextSibling;
        var parent = elem.parentNode;
        parent.removeChild(elem);
        var top_before = document.body.scrollHeight;
        window.scrollTo(window.scrollX, window.scrollY - (top_before - top_after));
        if (next_elem) {
          parent.insertBefore(elem, next_elem);
        } else {
          parent.appendChild(elem);
        }
        return;
      }
      if (props.animate_scrollfix && elem.getBoundingClientRect().top > 1600) {
        return;
      }
      elem.style.boxSizing = "border-box";
      elem.style.overflow = "hidden";
      if (!props.animate_noscale) {
        elem.style.transform = "scale(0.6)";
      }
      elem.style.opacity = "0";
      elem.style.height = "0px";
      elem.style.marginTop = "0px";
      elem.style.marginBottom = "0px";
      elem.style.paddingTop = "0px";
      elem.style.paddingBottom = "0px";
      elem.style.borderTopWidth = "0px";
      elem.style.borderBottomWidth = "0px";
      elem.style.transition = "none";
      setTimeout(function() {
        elem.className += " animate-inout";
        elem.style.height = h + "px";
        elem.style.transform = "scale(1)";
        elem.style.opacity = "1";
        elem.style.marginTop = margin_top;
        elem.style.marginBottom = margin_bottom;
        elem.style.paddingTop = padding_top;
        elem.style.paddingBottom = padding_bottom;
        elem.style.borderTopWidth = border_top_width;
        elem.style.borderBottomWidth = border_bottom_width;
      }, 1);
      elem.addEventListener("transitionend", function handler() {
        elem.classList.remove("animate-inout");
        elem.style.transition = elem.style.transform = elem.style.opacity = elem.style.height = null;
        elem.style.boxSizing = elem.style.marginTop = elem.style.marginBottom = null;
        elem.style.paddingTop = elem.style.paddingBottom = elem.style.overflow = null;
        elem.style.borderTopWidth = elem.style.borderBottomWidth = elem.style.overflow = null;
        elem.removeEventListener("transitionend", handler, false);
      });
    }

    shouldScrollFix(elem, props) {
      var pos = elem.getBoundingClientRect();
      if (props.animate_scrollfix && window.scrollY > 300 && pos.top < 0 && !document.querySelector(".noscrollfix:hover")) {
        return true;
      }
      return false;
    }

    slideDownAnime(elem, props) {
      elem.style.overflowY = "hidden";
      return anime({
        targets: elem,
        height: [0, elem.offsetHeight],
        easing: 'easeInOutExpo'
      });
    }

    slideUpAnime(elem, remove_func, props) {
      elem.style.overflowY = "hidden";
      return anime({
        targets: elem,
        height: [elem.offsetHeight, 0],
        complete: remove_func,
        easing: 'easeInOutExpo'
      });
    }

    slideUp(elem, remove_func, props) {
      if (window.Animation.shouldScrollFix(elem, props) && elem.nextSibling) {
        var top_after = document.body.scrollHeight;
        var next_elem = elem.nextSibling;
        var parent = elem.parentNode;
        parent.removeChild(elem);
        var top_before = document.body.scrollHeight;
        window.scrollTo(window.scrollX, window.scrollY + (top_before - top_after));
        if (next_elem) {
          parent.insertBefore(elem, next_elem);
        } else {
          parent.appendChild(elem);
        }
        remove_func();
        return;
      }
      if (props.animate_scrollfix && elem.getBoundingClientRect().top > 1600) {
        remove_func();
        return;
      }
      elem.className += " animate-inout";
      elem.style.boxSizing = "border-box";
      elem.style.height = elem.offsetHeight + "px";
      elem.style.overflow = "hidden";
      elem.style.transform = "scale(1)";
      elem.style.opacity = "1";
      elem.style.pointerEvents = "none";
      setTimeout(function() {
        var cstyle = window.getComputedStyle(elem);
        elem.style.height = "0px";
        elem.style.marginTop = (0 - parseInt(cstyle.borderTopWidth) - parseInt(cstyle.borderBottomWidth)) + "px";
        elem.style.marginBottom = "0px";
        elem.style.paddingTop = "0px";
        elem.style.paddingBottom = "0px";
        elem.style.transform = "scale(0.8)";
        elem.style.opacity = "0";
      }, 1);
      elem.addEventListener("transitionend", function handler(e) {
        if (e.propertyName === "opacity" || e.elapsedTime >= 0.6) {
          elem.removeEventListener("transitionend", handler, false);
          setTimeout(function() {
            remove_func();
          }, 2000);
        }
      });
    }

    showRight(elem, props) {
      elem.className += " animate";
      elem.style.opacity = 0;
      elem.style.transform = "TranslateX(-20px) Scale(1.01)";
      setTimeout(function() {
        elem.style.opacity = 1;
        elem.style.transform = "TranslateX(0px) Scale(1)";
      }, 1);
      elem.addEventListener("transitionend", function handler() {
        elem.classList.remove("animate");
        elem.style.transform = elem.style.opacity = null;
        elem.removeEventListener("transitionend", handler, false);
      });
    }

    show(elem, props) {
      var delay = (arguments[arguments.length - 2] != null ? arguments[arguments.length - 2].delay : undefined);
      delay = delay ? delay * 1000 : 1;
      elem.className += " animate";
      elem.style.opacity = 0;
      setTimeout(function() {
        elem.style.opacity = 1;
      }, delay);
      elem.addEventListener("transitionend", function handler() {
        elem.classList.remove("animate");
        elem.style.opacity = null;
        elem.removeEventListener("transitionend", handler, false);
      });
    }

    hide(elem, remove_func, props) {
      var delay = (arguments[arguments.length - 2] != null ? arguments[arguments.length - 2].delay : undefined);
      delay = delay ? delay * 1000 : 1;
      elem.className += " animate";
      setTimeout(function() {
        elem.style.opacity = 0;
      }, delay);
      elem.addEventListener("transitionend", function handler(e) {
        if (e.propertyName === "opacity") {
          remove_func();
          elem.removeEventListener("transitionend", handler, false);
        }
      });
    }

    addVisibleClass(elem, props) {
      setTimeout(function() {
        elem.classList.add("visible");
      });
    }

    cloneAnimation(elem, animation) {
      window.requestAnimationFrame(function() {
        if (elem.style.pointerEvents === "none") {
          elem = elem.nextSibling;
        }
        elem.style.position = "relative";
        elem.style.zIndex = "2";
        var clone_el = elem.cloneNode(true);
        var cstyle = window.getComputedStyle(elem);
        clone_el.classList.remove("loading");
        clone_el.style.position = "absolute";
        clone_el.style.zIndex = "1";
        clone_el.style.pointerEvents = "none";
        clone_el.style.animation = "none";
        elem.parentNode.insertBefore(clone_el, elem);
        var cloneleft = clone_el.offsetLeft;
        clone_el.parentNode.removeChild(clone_el);
        clone_el.style.marginLeft = parseInt(cstyle.marginLeft) + elem.offsetLeft - cloneleft + "px";
        elem.parentNode.insertBefore(clone_el, elem);
        clone_el.style.animation = animation + " 0.8s ease-in-out forwards";
        setTimeout(function() {
          clone_el.remove();
        }, 1000);
      });
    }

    flashIn(elem) {
      if (elem.offsetWidth > 100) {
        this.cloneAnimation(elem, "flash-in-big");
      } else {
        this.cloneAnimation(elem, "flash-in");
      }
    }

    flashOut(elem) {
      if (elem.offsetWidth > 100) {
        this.cloneAnimation(elem, "flash-out-big");
      } else {
        this.cloneAnimation(elem, "flash-out");
      }
    }
  }

  window.Animation = new Animation();

})();
