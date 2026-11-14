// A stand-in for https://www.youtube.com/iframe_api with the same surface the app uses,
// backed by a local <video> so sync logic can be tested without reaching YouTube.
(function () {
  var S = { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3 };
  function Player(host, opts) {
    var v = document.createElement("video");
    v.src = "http://127.0.0.1:3199/test-film.webm";
    v.playsInline = true;
    v.preload = "auto";
    v.style.width = "100%";
    v.style.height = "100%";
    v.setAttribute("data-testid", "player-video");
    v.setAttribute("data-fake-youtube", opts.videoId);
    host.replaceWith(v);
    var state = S.UNSTARTED;
    var self = this;
    function emit(s) {
      state = s;
      opts.events && opts.events.onStateChange && opts.events.onStateChange({ data: s, target: self });
    }
    v.addEventListener("playing", function () { emit(S.PLAYING); });
    v.addEventListener("pause", function () { if (!v.ended) emit(S.PAUSED); });
    v.addEventListener("waiting", function () { emit(S.BUFFERING); });
    v.addEventListener("ended", function () { emit(S.ENDED); });
    v.addEventListener("loadedmetadata", function () {
      opts.events && opts.events.onReady && opts.events.onReady({ target: self });
    }, { once: true });
    this.playVideo = function () { v.play().catch(function () {}); };
    this.pauseVideo = function () { v.pause(); };
    this.seekTo = function (t) { v.currentTime = t; };
    this.setPlaybackRate = function (r) { v.playbackRate = r; };
    this.getCurrentTime = function () { return v.currentTime; };
    this.getDuration = function () { return isFinite(v.duration) ? v.duration : 0; };
    this.getPlayerState = function () { return state; };
    this.setVolume = function (x) { v.volume = x / 100; };
    this.mute = function () { v.muted = true; };
    this.unMute = function () { v.muted = false; };
    this.destroy = function () { v.pause(); v.remove(); };
    this.getIframe = function () { return v; };
    this.loadModule = function (m) { if (m === "captions") v.setAttribute("data-captions", "on"); };
    this.unloadModule = function (m) { if (m === "captions") v.setAttribute("data-captions", "off"); };
  }
  window.YT = { Player: Player, PlayerState: S };
  setTimeout(function () { window.onYouTubeIframeAPIReady && window.onYouTubeIframeAPIReady(); }, 0);
})();
