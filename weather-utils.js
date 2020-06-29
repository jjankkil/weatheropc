
 class WeatherUtils {

    static WindDirectionAsText(degrees, language) {
        // remove "bias"
        while(degrees > 360)
            degrees -= 360;

        let result = '';
        if ( (45 - 22.5) <= degrees && degrees < (45 + 22.5) )
        {
            result = language == "fi"
            ? 'koillisesta'
            : 'NE';
        }
        else if ( (90 - 22.5) < degrees && degrees < (90 + 22.5) )
        {
        result = language == "fi"
            ? 'idästä'
            : 'E';
        }
        else if ( (135 - 22.5) < degrees && degrees < (135 + 22.5) )
        {
        result = language == "fi"
            ? 'kaakosta'
            : 'SE';
        }
        else if ( (180 - 22.5) <= degrees && degrees < (180 + 22.5) )
        {
        result = (language == "fi")
            ? 'etelästä'
            : 'S';
        }
        else if ( (225 - 22.5) <= degrees && degrees < (225 + 22.5) )
        {
        result = (language == "fi")
            ? 'lounaasta'
            : 'SW';
        }
        else if ( (270 - 22.5) <= degrees && degrees < (270 + 22.5) )
        {
        result = (language == "fi")
            ? 'lännestä'
            : 'W';
        }
        else if ( (315 - 22.5) <= degrees && degrees < (315 + 22.5) )
        {
        result = (language == "fi")
            ? 'luoteesta'
            : 'NW';
        }
        else
        {
        result = (language == "fi")
            ? 'pohjoisesta'
            : 'N';
        }

        return result;
    }
}

module.exports = WeatherUtils;
