$(document).ready(function() {

  $('#datepicker').datepicker({
          firstDay: 1,
          dateFormat: '@',  //@=ms since 01/01/1970.
          minDate: new Date(min_time * 1000),
          maxDate: 0,
          onSelect: function(val, inst) {
                  // Get the chosen start time, rounded to midnight plus the TV day start, in seconds.
                  var chosen  = Math.round(val / 86400000.0) * 86400 + day_start;
                  request_update(chosen);                  
          }
  });

  $().UItoTop({easingType: 'easeOutQuart'});
  $('.backtotop').click(function() {
    $('html, body').animate({scrollTop: 0}, 500);
  });

  function request_update(chosen)
  {
    $('#title_date').html( " - " + $.datepicker.formatDate("d MM yy", new Date(chosen * 1000)) );

    $('#rresults').html("");
    $('#rspinner').show('fast');
    $('#wresults').html("");
    $('#wspinner').show('fast');

    $.ajax({
      type: "GET",
      dataType: "text",
      url: "/tvdiary/day_view.jim?start=" + chosen + "&type=R",
      success: function(data) {
        $('#rresults').html(data);
        $('#rspinner').hide('slow');
      },
      error: function(_, _, e) {
        if (window.console)
          console.log("ajax error " + e);
        $('#rresults').html("Sorry, unavailable due to server error");
        $('#rspinner').hide('slow');
      }
    });
    
    $.ajax({
      type: "GET",
      dataType: "text",
      url: "/tvdiary/day_view.jim?start=" + chosen + "&type=W",
      success: function(data) {
        $('#wresults').html(data);
        $('#wspinner').hide('slow');
      },
      error: function(_, _, e) {
        if (window.console)
          console.log("ajax error " + e);
        $('#wresults').html("Sorry, unavailable due to server error");
        $('#wspinner').hide('slow');
      }
    });
  }

  // When the page loads, show today's details.
  request_update(Math.floor(new Date().getTime() / 86400000.0) * 86400 + day_start);                  

});
